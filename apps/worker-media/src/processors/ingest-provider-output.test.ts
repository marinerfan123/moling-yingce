import { describe, expect, it } from "vitest";

import {
  InMemoryProviderOutputIngestReceiptStore,
  ingestProviderOutput,
  type ProviderOutputIngestReceiptStore,
  type SafeFetchProxy,
} from "./ingest-provider-output.js";

const safeFetch = {
  url: "https://cdn.provider-output.invalid/image.png",
  maxBytes: 1024,
  timeoutMs: 5_000,
};
const operation = { signal: new AbortController().signal, deadlineAt: Date.now() + 5_000 };

describe("provider output ingest", () => {
  it("uses Media SafeFetch and quarantines valid bytes without publishing a ready asset", async () => {
    const proxy: SafeFetchProxy = {
      fetch: async (request, sink) => {
        expect(request).toEqual({
          ...safeFetch,
          caller: "media-worker",
          quarantineKey: "quarantine/provider-output/ingest_12345678",
        });
        await sink.open(request.quarantineKey, operation);
        await sink.write(request.quarantineKey, Buffer.from("payload"), operation);
        const receipt = await sink.complete(
          request.quarantineKey,
          {
            url: safeFetch.url,
            pinnedIp: "93.184.216.34",
            tlsServerName: "cdn.provider-output.invalid",
            bytes: 7,
            sha256: `sha256:${"a".repeat(64)}`,
          },
          operation,
        );
        return {
          allow: true,
          pinnedIp: "93.184.216.34",
          finalUrl: safeFetch.url,
          tlsServerName: "cdn.provider-output.invalid",
          bytes: 7,
          sha256: `sha256:${"a".repeat(64)}`,
          receipt,
        };
      },
    };
    const written: Uint8Array[] = [];
    const completed: unknown[] = [];
    const sink = {
      open: async (expectedKey: string) => {
        expect(expectedKey).toBe("quarantine/provider-output/ingest_12345678");
      },
      write: async (expectedKey: string, chunk: Uint8Array) => {
        expect(expectedKey).toBe("quarantine/provider-output/ingest_12345678");
        written.push(chunk);
      },
      complete: async (expectedKey: string, accepted: unknown) => {
        expect(expectedKey).toBe("quarantine/provider-output/ingest_12345678");
        completed.push(accepted);
        return {
          quarantineKey: "quarantine/provider-output/ingest_12345678",
          bytes: 7,
          sha256: `sha256:${"a".repeat(64)}`,
        };
      },
      abort: async () => undefined,
    };
    const result = await ingestProviderOutput(
      { instructionId: "ingest_12345678", expiresAt: new Date(Date.now() + 60_000).toISOString(), fetch: safeFetch },
      { eventId: "event_output_12345678" },
      sink,
      proxy,
      new InMemoryProviderOutputIngestReceiptStore(),
    );
    expect(result).toMatchObject({ status: "quarantined", bytes: 7 });
    expect(Buffer.concat(written.map((chunk) => Buffer.from(chunk))).toString()).toBe("payload");
    expect(completed).toHaveLength(1);
  });

  it("makes unsafe redirects and expired signed outputs recoverable without writing assets", async () => {
    const sink = {
      open: async () => {
        throw new Error("NETWORK_MUST_NOT_OPEN");
      },
      write: async () => {
        throw new Error("NETWORK_MUST_NOT_OPEN");
      },
      complete: async () => {
        throw new Error("NETWORK_MUST_NOT_OPEN");
      },
      abort: async () => {
        throw new Error("NETWORK_MUST_NOT_OPEN");
      },
    };
    const reject: SafeFetchProxy = {
      fetch: async () => ({ allow: false, reason: "SAFE_FETCH_REDIRECT_PRIVATE_ADDRESS" }),
    };
    await expect(
      ingestProviderOutput(
        { instructionId: "ingest_expired", expiresAt: new Date(Date.now() - 1).toISOString(), fetch: safeFetch },
        { eventId: "event_expired" },
        sink,
        reject,
        new InMemoryProviderOutputIngestReceiptStore(),
      ),
    ).resolves.toEqual({ status: "refresh_required", instructionId: "ingest_expired" });
    await expect(
      ingestProviderOutput(
        {
          instructionId: "ingest_private",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          fetch: safeFetch,
        },
        { eventId: "event_private" },
        sink,
        reject,
        new InMemoryProviderOutputIngestReceiptStore(),
      ),
    ).resolves.toMatchObject({ status: "recoverable_failure", reason: "SAFE_FETCH_REDIRECT_PRIVATE_ADDRESS" });
  });

  it("does not complete a receipt for a timed-out commit and completes only the reconciled retry", async () => {
    const key = "quarantine/provider-output/ingest_late_commit";
    let claims = 0;
    let failures = 0;
    let completions = 0;
    const receipts: ProviderOutputIngestReceiptStore = {
      kind: "test",
      claim: async () => ({ state: "claimed", quarantineKey: key, claimToken: `claim-${++claims}` }),
      fail: async () => {
        failures += 1;
      },
      complete: async () => {
        completions += 1;
      },
    };
    let attempts = 0;
    const proxy: SafeFetchProxy = {
      fetch: async () => {
        attempts += 1;
        if (attempts === 1) return { allow: false, reason: "SAFE_FETCH_TIMEOUT" };
        return {
          allow: true,
          pinnedIp: "93.184.216.34",
          finalUrl: safeFetch.url,
          tlsServerName: "cdn.provider-output.invalid",
          bytes: 7,
          sha256: `sha256:${"a".repeat(64)}`,
          receipt: { quarantineKey: key, bytes: 7, sha256: `sha256:${"a".repeat(64)}` },
        };
      },
    };
    const sink = {
      open: async () => undefined,
      write: async () => undefined,
      complete: async () => ({ quarantineKey: key, bytes: 7, sha256: `sha256:${"a".repeat(64)}` }),
      abort: async () => undefined,
    };
    const input = {
      instructionId: "ingest_late_commit",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      fetch: safeFetch,
    };

    await expect(ingestProviderOutput(input, { eventId: "late-1" }, sink, proxy, receipts)).resolves.toMatchObject({
      status: "recoverable_failure",
      reason: "SAFE_FETCH_TIMEOUT",
    });
    expect({ completions, failures }).toEqual({ completions: 0, failures: 1 });
    await expect(ingestProviderOutput(input, { eventId: "late-2" }, sink, proxy, receipts)).resolves.toMatchObject({
      status: "quarantined",
      bytes: 7,
    });
    expect({ completions, failures }).toEqual({ completions: 1, failures: 1 });
  });

  it("uses the DB claim key for idempotent sink retries and fences a mismatched receipt", async () => {
    const key = "quarantine/provider-output/ingest_retry_12345678";
    let claimCount = 0;
    let completeCount = 0;
    const receipts: ProviderOutputIngestReceiptStore = {
      kind: "test",
      claim: async () => ({ state: "claimed", quarantineKey: key, claimToken: `token-${++claimCount}` }),
      complete: async (_instructionId, _claimToken, _result) => {
        completeCount += 1;
        if (completeCount === 1) throw new Error("DB_COMPLETE_INTERRUPTED");
      },
      fail: async () => undefined,
    };
    const objects = new Map<string, Buffer>();
    const sink = {
      open: async (expectedKey: string) => {
        if (!objects.has(expectedKey)) objects.set(expectedKey, Buffer.alloc(0));
      },
      write: async (expectedKey: string, chunk: Uint8Array) => {
        if ((objects.get(expectedKey)?.length ?? 0) === 0) objects.set(expectedKey, Buffer.from(chunk));
      },
      complete: async (expectedKey: string) => ({
        quarantineKey: expectedKey,
        bytes: objects.get(expectedKey)?.length ?? 0,
        sha256: `sha256:${"a".repeat(64)}`,
      }),
      abort: async () => undefined,
    };
    const proxy: SafeFetchProxy = {
      fetch: async (request, nextSink) => {
        await nextSink.open(request.quarantineKey, operation);
        await nextSink.write(request.quarantineKey, Buffer.from("payload"), operation);
        const receipt = await nextSink.complete(
          request.quarantineKey,
          {
            url: request.url,
            pinnedIp: "93.184.216.34",
            tlsServerName: "cdn.provider-output.invalid",
            bytes: 7,
            sha256: `sha256:${"a".repeat(64)}`,
          },
          operation,
        );
        return {
          allow: true,
          pinnedIp: "93.184.216.34",
          finalUrl: request.url,
          tlsServerName: "cdn.provider-output.invalid",
          bytes: 7,
          sha256: `sha256:${"a".repeat(64)}`,
          receipt,
        };
      },
    };
    const input = {
      instructionId: "ingest_retry_12345678",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      fetch: safeFetch,
    };
    await expect(
      ingestProviderOutput(input, { eventId: "event_retry_1" }, sink, proxy, receipts),
    ).resolves.toMatchObject({ status: "recoverable_failure" });
    await expect(
      ingestProviderOutput(input, { eventId: "event_retry_2" }, sink, proxy, receipts),
    ).resolves.toMatchObject({ status: "quarantined", bytes: 7 });
    expect(objects).toHaveLength(1);
    expect(objects.get(key)?.toString()).toBe("payload");
  });
});
