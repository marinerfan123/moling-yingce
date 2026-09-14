import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { describe, expect, it, vi } from "vitest";

import {
  createNodeHttpsTransport,
  createSafeFetchProxy,
  S3ConditionalQuarantineSink,
  type NodeHttpsRequest,
} from "./safe-fetch.js";

const noOpSink = {
  open: async () => undefined,
  write: async () => undefined,
  complete: async () => ({ quarantineKey: "quarantine/test", bytes: 0, sha256: `sha256:${"a".repeat(64)}` }),
  abort: async () => undefined,
};
const quarantineKey = "quarantine/provider-output/ingest_12345678";
const signal = new AbortController().signal;

function compositeSha256(...parts: readonly Uint8Array[]): string {
  const partDigests = parts.map((part) => createHash("sha256").update(part).digest());
  return `${createHash("sha256").update(Buffer.concat(partDigests)).digest("base64")}-${parts.length}`;
}

function streamingBody(...chunks: readonly Uint8Array[]) {
  return {
    transformToByteArray: async () => {
      throw new Error("FULL_OBJECT_BUFFERING_FORBIDDEN");
    },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

describe("SafeFetchProxy", () => {
  it("resolves every hop itself and rejects a DNS rebind before transport", async () => {
    let calls = 0;
    const proxy = createSafeFetchProxy({
      resolve: async () =>
        calls++ === 0 ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }],
      request: async () => ({ status: 200, headers: {}, bytes: 1, sha256: `sha256:${"a".repeat(64)}` }),
    });
    await expect(
      proxy.fetch({ url: "https://cdn.example.com/a", maxBytes: 10, timeoutMs: 1_000, quarantineKey }, noOpSink),
    ).resolves.toMatchObject({ allow: false, reason: "SAFE_FETCH_DNS_REBIND" });
  });

  it("resolves and validates every redirect hop before requesting its pinned IP", async () => {
    const resolutions = [
      [{ address: "93.184.216.34", family: 4 as const }],
      [{ address: "93.184.216.34", family: 4 as const }],
      [{ address: "93.184.216.35", family: 4 as const }],
      [{ address: "93.184.216.35", family: 4 as const }],
    ];
    const requested: string[] = [];
    const proxy = createSafeFetchProxy({
      resolve: async () => resolutions.shift() ?? [],
      request: async (input) => {
        requested.push(`${input.tlsServerName}:${input.pinnedIp}`);
        return requested.length === 1
          ? {
              status: 302,
              headers: { location: "https://final.example.com/file" },
              bytes: 0,
              sha256: "sha256:redirect",
            }
          : {
              status: 200,
              headers: {},
              bytes: 2,
              sha256: `sha256:${"a".repeat(64)}`,
              receipt: { quarantineKey: "quarantine/test", bytes: 2, sha256: `sha256:${"a".repeat(64)}` },
            };
      },
    });

    await expect(
      proxy.fetch({ url: "https://origin.example.com/a", maxBytes: 10, timeoutMs: 1_000, quarantineKey }, noOpSink),
    ).resolves.toMatchObject({ allow: true, pinnedIp: "93.184.216.35", tlsServerName: "final.example.com" });
    expect(requested).toEqual(["origin.example.com:93.184.216.34", "final.example.com:93.184.216.35"]);
  });

  it("rejects a redirect whose freshly resolved address is private", async () => {
    let calls = 0;
    const proxy = createSafeFetchProxy({
      resolve: async () => {
        calls += 1;
        return calls <= 2
          ? [{ address: "93.184.216.34", family: 4 as const }]
          : [{ address: "10.0.0.1", family: 4 as const }];
      },
      request: async () => ({
        status: 302,
        headers: { location: "https://internal.example.com/file" },
        bytes: 0,
        sha256: "sha256:redirect",
      }),
    });
    await expect(
      proxy.fetch({ url: "https://origin.example.com/a", maxBytes: 10, timeoutMs: 1_000, quarantineKey }, noOpSink),
    ).resolves.toEqual({ allow: false, reason: "SAFE_FETCH_REDIRECT_PRIVATE_ADDRESS" });
  });

  it("uses the pinned IP for TCP while preserving hostname TLS verification and enforces body limits", async () => {
    let options: RequestOptions | undefined;
    let timeout: number | undefined;
    const request: NodeHttpsRequest = (nextOptions, onResponse) => {
      options = nextOptions;
      const response = new EventEmitter() as unknown as IncomingMessage;
      Object.assign(response, {
        destroy: () => response,
        headers: {},
        pause: () => response,
        resume: () => response,
        statusCode: 200,
      });
      const client = new EventEmitter() as unknown as ClientRequest;
      Object.assign(client, {
        destroy: (error?: Error) => {
          queueMicrotask(() => client.emit("error", error));
          return client;
        },
        end: () => {
          queueMicrotask(() => {
            onResponse(response);
            response.emit("data", Buffer.from("12345"));
            response.emit("end");
          });
          return client;
        },
        setTimeout: (nextTimeout: number) => {
          timeout = nextTimeout;
          return client;
        },
      });
      return client;
    };
    const transport = createNodeHttpsTransport({ request });
    await expect(
      transport.request(
        {
          url: "https://cdn.example.com:443/image.png",
          pinnedIp: "93.184.216.34",
          tlsServerName: "cdn.example.com",
          maxBytes: 4,
          timeoutMs: 777,
          deadlineAt: Date.now() + 777,
          signal,
          quarantineKey,
        },
        noOpSink,
      ),
    ).rejects.toMatchObject({ code: "SAFE_FETCH_RESPONSE_TOO_LARGE" });
    expect(options).toMatchObject({
      hostname: "cdn.example.com",
      servername: "cdn.example.com",
      rejectUnauthorized: true,
    });
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(777);
    await expect(
      new Promise<Readonly<{ address: string; family: number }>>((resolve, reject) => {
        options?.lookup?.("ignored.example", {}, (error, address, family) => {
          if (error || typeof address !== "string" || !family) return reject(error ?? new Error("lookup failed"));
          resolve({ address, family });
        });
      }),
    ).resolves.toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("aborts the request when its timeout elapses", async () => {
    const request: NodeHttpsRequest = (_options, _onResponse) => {
      const client = new EventEmitter() as unknown as ClientRequest;
      Object.assign(client, {
        destroy: (error?: Error) => {
          queueMicrotask(() => client.emit("error", error));
          return client;
        },
        end: () => client,
        setTimeout: (_timeout: number, onTimeout: () => void) => {
          queueMicrotask(onTimeout);
          return client;
        },
      });
      return client;
    };
    await expect(
      createNodeHttpsTransport({ request }).request(
        {
          url: "https://cdn.example.com/image.png",
          pinnedIp: "93.184.216.34",
          tlsServerName: "cdn.example.com",
          maxBytes: 4,
          timeoutMs: 1,
          deadlineAt: Date.now() + 1,
          signal,
          quarantineKey,
        },
        noOpSink,
      ),
    ).rejects.toMatchObject({ code: "SAFE_FETCH_TIMEOUT" });
  });

  it("streams a successful response directly to quarantine once and completes with its incremental hash", async () => {
    const request: NodeHttpsRequest = (_options, onResponse) => {
      const response = new EventEmitter() as unknown as IncomingMessage;
      const chunks = [Buffer.from("abc"), Buffer.from("def")];
      let paused = true;
      const pump = () => {
        if (paused) return;
        const chunk = chunks.shift();
        if (chunk) response.emit("data", chunk);
        else response.emit("end");
      };
      Object.assign(response, {
        headers: {},
        pause: () => {
          paused = true;
          return response;
        },
        resume: () => {
          paused = false;
          queueMicrotask(pump);
          return response;
        },
        statusCode: 200,
      });
      const client = new EventEmitter() as unknown as ClientRequest;
      Object.assign(client, {
        destroy: () => client,
        end: () => {
          queueMicrotask(() => {
            onResponse(response);
          });
          return client;
        },
        setTimeout: () => client,
      });
      return client;
    };
    const received: Buffer[] = [];
    const completed: unknown[] = [];
    const sink = {
      open: async (expectedKey: string) => expect(expectedKey).toBe(quarantineKey),
      write: async (expectedKey: string, chunk: Uint8Array) => {
        expect(expectedKey).toBe(quarantineKey);
        received.push(Buffer.from(chunk));
      },
      complete: async (expectedKey: string, receipt: unknown) => {
        expect(expectedKey).toBe(quarantineKey);
        completed.push(receipt);
        return { quarantineKey: "quarantine/provider-output/ingest_123", bytes: 6, sha256: `sha256:${"b".repeat(64)}` };
      },
      abort: async () => undefined,
    };
    const result = await createNodeHttpsTransport({ request }).request(
      {
        url: "https://cdn.example.com/image.png",
        pinnedIp: "93.184.216.34",
        tlsServerName: "cdn.example.com",
        maxBytes: 10,
        timeoutMs: 1_000,
        deadlineAt: Date.now() + 1_000,
        signal,
        quarantineKey,
      },
      sink,
    );
    expect(Buffer.concat(received).toString()).toBe("abcdef");
    expect(completed).toHaveLength(1);
    expect(completed).toEqual([
      expect.objectContaining({
        bytes: 6,
        sha256: "sha256:bef57ec7f53a6d40beb640a780a639c83bc29ac8a9816f1fc6c5c6dcd93c4721",
      }),
    ]);
    expect(result).toMatchObject({ bytes: 6, receipt: { quarantineKey: "quarantine/provider-output/ingest_123" } });
  });

  it("pauses every response chunk until a slow quarantine write settles", async () => {
    const chunkCount = 500;
    const chunk = Buffer.alloc(1_000_000, 0x61);
    let offered = 0;
    let completedWrites = 0;
    let maximumOutstanding = 0;
    let paused = true;
    let ended = false;
    let releaseFirstWrite: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const response = new EventEmitter() as unknown as IncomingMessage;
    const pump = () => {
      if (paused || ended) return;
      if (offered === chunkCount) {
        ended = true;
        response.emit("end");
        return;
      }
      offered += 1;
      maximumOutstanding = Math.max(maximumOutstanding, offered - completedWrites);
      response.emit("data", chunk);
      queueMicrotask(pump);
    };
    Object.assign(response, {
      headers: {},
      statusCode: 200,
      pause: () => {
        paused = true;
        return response;
      },
      resume: () => {
        paused = false;
        queueMicrotask(pump);
        return response;
      },
      destroy: () => response,
    });
    const request: NodeHttpsRequest = (_options, onResponse) => {
      const client = new EventEmitter() as unknown as ClientRequest;
      Object.assign(client, {
        destroy: () => client,
        end: () => {
          queueMicrotask(() => onResponse(response));
          return client;
        },
        setTimeout: () => client,
      });
      return client;
    };
    let writeCalls = 0;
    const result = createNodeHttpsTransport({ request }).request(
      {
        url: "https://origin.example.com/large.bin",
        pinnedIp: "93.184.216.34",
        tlsServerName: "origin.example.com",
        maxBytes: 500_000_000,
        timeoutMs: 10_000,
        deadlineAt: Date.now() + 10_000,
        signal: new AbortController().signal,
        quarantineKey,
      },
      {
        open: async () => undefined,
        write: async () => {
          writeCalls += 1;
          if (writeCalls === 1) await firstWrite;
          completedWrites += 1;
        },
        complete: async (key, accepted) => ({
          quarantineKey: key,
          bytes: accepted.bytes,
          sha256: accepted.sha256,
        }),
        abort: async () => undefined,
      },
    );
    await new Promise<void>(setImmediate);
    releaseFirstWrite?.();
    await expect(result).resolves.toMatchObject({ bytes: 500_000_000 });
    expect(offered).toBe(chunkCount);
    expect(maximumOutstanding).toBe(1);
  });

  it("returns a controlled rejection for malformed locators without resolving them", async () => {
    const proxy = createSafeFetchProxy({
      resolve: async () => {
        throw new Error("DNS_MUST_NOT_RUN");
      },
      request: async () => {
        throw new Error("REQUEST_MUST_NOT_RUN");
      },
    });
    await expect(
      proxy.fetch({ url: "not a URL", maxBytes: 1, timeoutMs: 1, quarantineKey }, noOpSink),
    ).resolves.toEqual({
      allow: false,
      reason: "SAFE_FETCH_NON_HTTPS_PROTOCOL",
    });
  });

  it("enforces one absolute deadline across slow DNS and every redirect hop", async () => {
    vi.useFakeTimers();
    try {
      let dnsSignal: AbortSignal | undefined;
      const slowDns = createSafeFetchProxy({
        resolve: async (_hostname, options) => {
          dnsSignal = options.signal;
          return new Promise<readonly { address: string; family: 4 }[]>(() => undefined);
        },
        request: async () => {
          throw new Error("REQUEST_MUST_NOT_RUN");
        },
      });
      const slowDnsResult = slowDns.fetch(
        { url: "https://origin.example.com/a", maxBytes: 10, timeoutMs: 100, quarantineKey },
        noOpSink,
      );
      await vi.advanceTimersByTimeAsync(100);
      await expect(slowDnsResult).resolves.toEqual({ allow: false, reason: "SAFE_FETCH_TIMEOUT" });
      expect(dnsSignal?.aborted).toBe(true);

      const addresses = [{ address: "93.184.216.34", family: 4 as const }];
      let requests = 0;
      const redirecting = createSafeFetchProxy({
        resolve: async () => addresses,
        request: async () => {
          requests += 1;
          await new Promise((resolve) => setTimeout(resolve, 60));
          return {
            status: 302,
            headers: { location: `https://hop${requests}.example.com/file` },
            bytes: 0,
            sha256: "sha256:redirect",
          };
        },
      });
      const redirectResult = redirecting.fetch(
        { url: "https://origin.example.com/a", maxBytes: 10, timeoutMs: 100, quarantineKey },
        noOpSink,
      );
      await vi.advanceTimersByTimeAsync(120);
      await expect(redirectResult).resolves.toEqual({ allow: false, reason: "SAFE_FETCH_TIMEOUT" });
      expect(requests).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("destroys redirect and error response bodies without opening or writing quarantine", async () => {
    let destroyed = 0;
    const request: NodeHttpsRequest = (_options, onResponse) => {
      const response = new EventEmitter() as unknown as IncomingMessage;
      Object.assign(response, {
        headers: { location: "https://next.example.com/file" },
        statusCode: 302,
        destroy: () => {
          destroyed += 1;
          return response;
        },
      });
      const client = new EventEmitter() as unknown as ClientRequest;
      Object.assign(client, {
        destroy: () => client,
        end: () => {
          queueMicrotask(() => onResponse(response));
          return client;
        },
        setTimeout: () => client,
      });
      return client;
    };
    const calls: string[] = [];
    const sink = {
      open: async () => {
        calls.push("open");
      },
      write: async () => {
        calls.push("write");
      },
      complete: async () => {
        calls.push("complete");
        return { quarantineKey, bytes: 0, sha256: `sha256:${"a".repeat(64)}` };
      },
      abort: async () => {
        calls.push("abort");
      },
    };
    await expect(
      createNodeHttpsTransport({ request }).request(
        {
          url: "https://origin.example.com/a",
          pinnedIp: "93.184.216.34",
          tlsServerName: "origin.example.com",
          maxBytes: 10,
          timeoutMs: 1_000,
          deadlineAt: Date.now() + 1_000,
          signal,
          quarantineKey,
        },
        sink,
      ),
    ).resolves.toMatchObject({ status: 302, bytes: 0 });
    expect(destroyed).toBe(1);
    expect(calls).toEqual([]);
  });

  it("aborts a slow-drip body at the absolute deadline without completing quarantine", async () => {
    vi.useFakeTimers();
    try {
      let destroyed = 0;
      const request: NodeHttpsRequest = (_options, onResponse) => {
        const response = new EventEmitter() as unknown as IncomingMessage;
        Object.assign(response, {
          headers: {},
          statusCode: 200,
          pause: () => response,
          resume: () => response,
          destroy: () => {
            destroyed += 1;
            return response;
          },
        });
        const client = new EventEmitter() as unknown as ClientRequest;
        Object.assign(client, {
          destroy: () => client,
          end: () => {
            queueMicrotask(() => {
              onResponse(response);
              setTimeout(() => response.emit("data", Buffer.from("a")), 10);
              setTimeout(() => response.emit("data", Buffer.from("b")), 150);
              setTimeout(() => response.emit("end"), 151);
            });
            return client;
          },
          setTimeout: () => client,
        });
        return client;
      };
      const completed = vi.fn();
      const result = createNodeHttpsTransport({ request }).request(
        {
          url: "https://origin.example.com/a",
          pinnedIp: "93.184.216.34",
          tlsServerName: "origin.example.com",
          maxBytes: 10,
          timeoutMs: 100,
          deadlineAt: Date.now() + 100,
          signal,
          quarantineKey,
        },
        {
          open: async () => undefined,
          write: async () => undefined,
          complete: async () => {
            completed();
            return { quarantineKey, bytes: 1, sha256: `sha256:${"a".repeat(64)}` };
          },
          abort: async () => undefined,
        },
      );
      const rejected = expect(result).rejects.toMatchObject({ code: "SAFE_FETCH_TIMEOUT" });
      await new Promise<void>(queueMicrotask);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(100);
      await rejected;
      expect(destroyed).toBeGreaterThan(0);
      expect(completed).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["open", "write", "complete"] as const)(
    "bounds a stalled quarantine sink %s operation by the shared absolute deadline",
    async (stalledOperation) => {
      vi.useFakeTimers();
      try {
        const contexts: AbortSignal[] = [];
        let finalized = false;
        const waitForAbort = async (context: { signal: AbortSignal }) => {
          contexts.push(context.signal);
          await new Promise<never>((_resolve, reject) => {
            if (context.signal.aborted) return reject(new Error("ABORTED"));
            context.signal.addEventListener("abort", () => reject(new Error("ABORTED")), { once: true });
          });
        };
        const sink = {
          open: async (_key: string, context: { signal: AbortSignal }) => {
            contexts.push(context.signal);
            if (stalledOperation === "open") await waitForAbort(context);
          },
          write: async (_key: string, _chunk: Uint8Array, context: { signal: AbortSignal }) => {
            contexts.push(context.signal);
            if (stalledOperation === "write") await waitForAbort(context);
          },
          complete: async (key: string, _accepted: unknown, context: { signal: AbortSignal }) => {
            contexts.push(context.signal);
            if (stalledOperation === "complete") await waitForAbort(context);
            finalized = true;
            return { quarantineKey: key, bytes: 1, sha256: `sha256:${"a".repeat(64)}` };
          },
          abort: async (_key: string, _reason: string, context: { signal: AbortSignal }) => {
            contexts.push(context.signal);
            await Promise.resolve();
          },
        };
        const request: NodeHttpsRequest = (_options, onResponse) => {
          const response = new EventEmitter() as unknown as IncomingMessage;
          let delivered = false;
          Object.assign(response, {
            headers: {},
            statusCode: 200,
            pause: () => response,
            resume: () => {
              if (!delivered) {
                delivered = true;
                queueMicrotask(() => {
                  response.emit("data", Buffer.from("a"));
                  response.emit("end");
                });
              }
              return response;
            },
            destroy: () => response,
          });
          const client = new EventEmitter() as unknown as ClientRequest;
          Object.assign(client, {
            destroy: () => client,
            end: () => {
              queueMicrotask(() => onResponse(response));
              return client;
            },
            setTimeout: () => client,
          });
          return client;
        };
        const result = createNodeHttpsTransport({ request }).request(
          {
            url: "https://origin.example.com/a",
            pinnedIp: "93.184.216.34",
            tlsServerName: "origin.example.com",
            maxBytes: 10,
            timeoutMs: 100,
            deadlineAt: Date.now() + 100,
            signal: new AbortController().signal,
            quarantineKey,
          },
          sink,
        );
        const rejected = expect(result).rejects.toMatchObject({
          code: "SAFE_FETCH_TIMEOUT",
        });
        await vi.advanceTimersByTimeAsync(100);
        await rejected;
        expect(contexts.length).toBeGreaterThan(0);
        expect(new Set(contexts).size).toBe(2);
        expect(contexts[0]?.aborted).toBe(true);
        expect(contexts.at(-1)).not.toBe(contexts[0]);
        expect(finalized).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("rejects immediately while aborting quarantine with an independent bounded cleanup context", async () => {
    vi.useFakeTimers();
    try {
      let operationSignal: AbortSignal | undefined;
      let cleanupSignal: AbortSignal | undefined;
      const request: NodeHttpsRequest = (_options, onResponse) => {
        const response = new EventEmitter() as unknown as IncomingMessage;
        Object.assign(response, {
          headers: {},
          statusCode: 200,
          pause: () => response,
          resume: () => response,
          destroy: () => response,
        });
        const client = new EventEmitter() as unknown as ClientRequest;
        Object.assign(client, {
          destroy: () => client,
          end: () => {
            queueMicrotask(() => {
              onResponse(response);
              response.emit("data", Buffer.from("payload"));
              response.emit("end");
            });
            return client;
          },
          setTimeout: () => client,
        });
        return client;
      };
      const result = createNodeHttpsTransport({ request, cleanupTimeoutMs: 50 }).request(
        {
          url: "https://origin.example.com/a",
          pinnedIp: "93.184.216.34",
          tlsServerName: "origin.example.com",
          maxBytes: 10,
          timeoutMs: 1_000,
          deadlineAt: Date.now() + 1_000,
          signal: new AbortController().signal,
          quarantineKey,
        },
        {
          open: async (_key, context) => {
            operationSignal = context.signal;
          },
          write: async () => undefined,
          complete: async () => {
            throw new Error("FINALIZE_REJECTED");
          },
          abort: async (_key, _reason, context) => {
            cleanupSignal = context.signal;
            await new Promise<never>((_resolve, reject) => {
              context.signal.addEventListener("abort", () => reject(new Error("CLEANUP_TIMEOUT")), { once: true });
            });
          },
        },
      );
      await expect(result).rejects.toMatchObject({ code: "SAFE_FETCH_TRANSPORT_REJECTED" });
      expect(operationSignal?.aborted).toBe(true);
      expect(cleanupSignal).toBeDefined();
      expect(cleanupSignal).not.toBe(operationSignal);
      expect(cleanupSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(50);
      expect(cleanupSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses AWS-supported SHA256 COMPOSITE multipart checksums and validates the committed length", async () => {
    const commands: Array<{ constructor: { name: string }; input: Record<string, unknown> }> = [];
    const sendSignals: Array<AbortSignal | undefined> = [];
    const payload = Buffer.from("payload");
    const digest = "sha256:239f59ed55e737c77147cf55ad0c1b030b6d7ee748a7426952f9b852d5a935e5";
    const composite = compositeSha256(payload);
    const client = {
      send: async (
        command: { constructor: { name: string }; input: Record<string, unknown> },
        options?: { abortSignal?: AbortSignal },
      ) => {
        commands.push(command);
        sendSignals.push(options?.abortSignal);
        if (command.constructor.name === "HeadObjectCommand") {
          if (commands.filter(({ constructor }) => constructor.name === "HeadObjectCommand").length === 1)
            throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
          return { ContentLength: 7, ChecksumSHA256: composite, ChecksumType: "COMPOSITE" };
        }
        if (command.constructor.name === "CreateMultipartUploadCommand") {
          if (command.input.ChecksumType !== "COMPOSITE") throw new Error("InvalidRequest: SHA256 requires COMPOSITE");
          return { UploadId: "upload-1" };
        }
        if (command.constructor.name === "UploadPartCommand") {
          return { ETag: '"etag-1"', ChecksumSHA256: command.input.ChecksumSHA256 };
        }
        if (command.constructor.name === "CompleteMultipartUploadCommand") {
          if (command.input.ChecksumType !== "COMPOSITE" || command.input.ChecksumSHA256 !== undefined)
            throw new Error("InvalidRequest: full-object SHA256 is unsupported for multipart");
          return { ChecksumSHA256: composite, ChecksumType: "COMPOSITE" };
        }
        return {};
      },
    };
    const sink = new S3ConditionalQuarantineSink({
      client: client as never,
      bucket: "quarantine-bucket",
    });
    const context = { signal: new AbortController().signal, deadlineAt: Date.now() + 1_000 };
    await sink.open(quarantineKey, context);
    await sink.write(quarantineKey, payload, context);
    await expect(
      sink.complete(
        quarantineKey,
        {
          url: "https://origin.example.com/a",
          pinnedIp: "93.184.216.34",
          tlsServerName: "origin.example.com",
          bytes: 7,
          sha256: digest,
        },
        context,
      ),
    ).resolves.toEqual({ quarantineKey, bytes: 7, sha256: digest });
    const completion = commands.find(({ constructor }) => constructor.name === "CompleteMultipartUploadCommand");
    const creation = commands.find(({ constructor }) => constructor.name === "CreateMultipartUploadCommand");
    expect(creation?.input).toMatchObject({ ChecksumAlgorithm: "SHA256", ChecksumType: "COMPOSITE" });
    expect(completion?.input).toMatchObject({
      Bucket: "quarantine-bucket",
      Key: quarantineKey,
      UploadId: "upload-1",
      IfNoneMatch: "*",
      ChecksumType: "COMPOSITE",
      MpuObjectSize: 7,
    });
    expect(completion?.input.ChecksumSHA256).toBeUndefined();
    expect(commands.some(({ constructor }) => constructor.name === "GetObjectCommand")).toBe(false);
    expect(sendSignals).not.toHaveLength(0);
    expect(sendSignals.every((nextSignal) => nextSignal === context.signal)).toBe(true);
  });

  it("streams an existing S3 object to prove its original SHA256 and byte length", async () => {
    const digest = "sha256:239f59ed55e737c77147cf55ad0c1b030b6d7ee748a7426952f9b852d5a935e5";
    let stored = Buffer.from("payload");
    const commands: string[] = [];
    const existingClient = {
      send: async (command: { constructor: { name: string } }) => {
        commands.push(command.constructor.name);
        if (command.constructor.name === "HeadObjectCommand")
          return { ContentLength: 7, ChecksumSHA256: "real-composite-1", ChecksumType: "COMPOSITE" };
        if (command.constructor.name === "GetObjectCommand")
          return { ContentLength: stored.byteLength, Body: streamingBody(stored.subarray(0, 3), stored.subarray(3)) };
        throw new Error(`UNEXPECTED_${command.constructor.name}`);
      },
    };
    const existing = new S3ConditionalQuarantineSink({ client: existingClient as never, bucket: "bucket" });
    const context = { signal: new AbortController().signal, deadlineAt: Date.now() + 1_000 };
    await existing.open(quarantineKey, context);
    await existing.write(quarantineKey, Buffer.from("payload"), context);
    await expect(
      existing.complete(
        quarantineKey,
        {
          url: "https://origin.example.com/a",
          pinnedIp: "93.184.216.34",
          tlsServerName: "origin.example.com",
          bytes: 7,
          sha256: digest,
        },
        context,
      ),
    ).resolves.toEqual({ quarantineKey, bytes: 7, sha256: digest });
    expect(commands).toEqual(["HeadObjectCommand", "GetObjectCommand"]);

    stored = Buffer.from("payloae");
    const mismatched = new S3ConditionalQuarantineSink({ client: existingClient as never, bucket: "bucket" });
    await mismatched.open(quarantineKey, context);
    await mismatched.write(quarantineKey, Buffer.from("payload"), context);
    await expect(
      mismatched.complete(
        quarantineKey,
        {
          url: "https://origin.example.com/a",
          pinnedIp: "93.184.216.34",
          tlsServerName: "origin.example.com",
          bytes: 7,
          sha256: digest,
        },
        context,
      ),
    ).rejects.toThrow("SAFE_FETCH_QUARANTINE_CONFLICT");
  });

  it("reconciles a conditional S3 finalize conflict idempotently and rejects different competing bytes", async () => {
    const digest = "sha256:239f59ed55e737c77147cf55ad0c1b030b6d7ee748a7426952f9b852d5a935e5";
    const context = { signal: new AbortController().signal, deadlineAt: Date.now() + 1_000 };
    let headCalls = 0;
    let matching = true;
    const client = {
      send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
        if (command.constructor.name === "HeadObjectCommand") {
          headCalls += 1;
          if (headCalls === 1)
            throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
          return { ContentLength: 7, ChecksumSHA256: "composite-1", ChecksumType: "COMPOSITE" };
        }
        if (command.constructor.name === "CreateMultipartUploadCommand") return { UploadId: "upload-conflict" };
        if (command.constructor.name === "UploadPartCommand")
          return { ETag: '"etag"', ChecksumSHA256: command.input?.ChecksumSHA256 };
        if (command.constructor.name === "CompleteMultipartUploadCommand")
          throw Object.assign(new Error("PreconditionFailed"), { $metadata: { httpStatusCode: 412 } });
        if (command.constructor.name === "GetObjectCommand") {
          const body = matching ? Buffer.from("payload") : Buffer.from("payloae");
          return { ContentLength: body.byteLength, Body: streamingBody(body) };
        }
        return {};
      },
    };
    const run = async () => {
      const sink = new S3ConditionalQuarantineSink({ client: client as never, bucket: "bucket" });
      await sink.open(quarantineKey, context);
      await sink.write(quarantineKey, Buffer.from("payload"), context);
      return sink.complete(
        quarantineKey,
        {
          url: "https://origin.example.com/a",
          pinnedIp: "93.184.216.34",
          tlsServerName: "origin.example.com",
          bytes: 7,
          sha256: digest,
        },
        context,
      );
    };
    await expect(run()).resolves.toEqual({ quarantineKey, bytes: 7, sha256: digest });
    headCalls = 0;
    matching = false;
    await expect(run()).rejects.toThrow("PreconditionFailed");
  });

  it("retains a failed MPU cleanup and retries abort before opening the key again", async () => {
    let abortCalls = 0;
    let createCalls = 0;
    const client = {
      send: async (command: { constructor: { name: string } }) => {
        if (command.constructor.name === "HeadObjectCommand")
          throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
        if (command.constructor.name === "CreateMultipartUploadCommand") return { UploadId: `upload-${++createCalls}` };
        if (command.constructor.name === "AbortMultipartUploadCommand") {
          abortCalls += 1;
          if (abortCalls === 1)
            throw Object.assign(new Error("NoSuchBucket"), {
              name: "NoSuchBucket",
              $metadata: { httpStatusCode: 404 },
            });
          return {};
        }
        return {};
      },
    };
    const sink = new S3ConditionalQuarantineSink({ client: client as never, bucket: "bucket" });
    const context = { signal: new AbortController().signal, deadlineAt: Date.now() + 1_000 };
    await sink.open(quarantineKey, context);
    await expect(sink.abort(quarantineKey, "SAFE_FETCH_TIMEOUT", context)).rejects.toThrow("NoSuchBucket");
    await expect(sink.open(quarantineKey, context)).resolves.toBeUndefined();
    expect({ abortCalls, createCalls }).toEqual({ abortCalls: 2, createCalls: 2 });
    await sink.abort(quarantineKey, "TEST_CLEANUP", context);
  });

  it("fails a timed-out late commit, then reconciles the deterministic key without finalizing twice", async () => {
    vi.useFakeTimers();
    try {
      const payload = Buffer.from("payload");
      const digest = "sha256:239f59ed55e737c77147cf55ad0c1b030b6d7ee748a7426952f9b852d5a935e5";
      const composite = compositeSha256(payload);
      let stored: Buffer | undefined;
      let uploaded = Buffer.alloc(0);
      let completeCalls = 0;
      let abortCalls = 0;
      const abortSignals: Array<AbortSignal | undefined> = [];
      const client = {
        send: async (
          command: { constructor: { name: string }; input: Record<string, unknown> },
          options?: { abortSignal?: AbortSignal },
        ) => {
          if (command.constructor.name === "HeadObjectCommand") {
            if (!stored)
              throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
            return { ContentLength: stored.byteLength, ChecksumSHA256: composite, ChecksumType: "COMPOSITE" };
          }
          if (command.constructor.name === "CreateMultipartUploadCommand") return { UploadId: "upload-late" };
          if (command.constructor.name === "UploadPartCommand") {
            uploaded = Buffer.from(command.input.Body as Uint8Array);
            return { ETag: '"etag"', ChecksumSHA256: command.input.ChecksumSHA256 };
          }
          if (command.constructor.name === "CompleteMultipartUploadCommand") {
            completeCalls += 1;
            return new Promise((resolve) => {
              setTimeout(() => {
                stored = Buffer.from(uploaded);
                resolve({ ChecksumSHA256: composite, ChecksumType: "COMPOSITE" });
              }, 150);
            });
          }
          if (command.constructor.name === "AbortMultipartUploadCommand") {
            abortCalls += 1;
            abortSignals.push(options?.abortSignal);
            return {};
          }
          if (command.constructor.name === "GetObjectCommand") {
            if (!stored) throw new Error("OBJECT_NOT_COMMITTED");
            return { ContentLength: stored.byteLength, Body: streamingBody(stored) };
          }
          return {};
        },
      };
      const sink = new S3ConditionalQuarantineSink({ client: client as never, bucket: "bucket" });
      const request: NodeHttpsRequest = (_options, onResponse) => {
        const response = new EventEmitter() as unknown as IncomingMessage;
        let delivered = false;
        Object.assign(response, {
          headers: {},
          statusCode: 200,
          pause: () => response,
          resume: () => {
            if (!delivered) {
              delivered = true;
              queueMicrotask(() => {
                response.emit("data", payload);
                response.emit("end");
              });
            }
            return response;
          },
          destroy: () => response,
        });
        const nextClient = new EventEmitter() as unknown as ClientRequest;
        Object.assign(nextClient, {
          destroy: () => nextClient,
          end: () => {
            queueMicrotask(() => onResponse(response));
            return nextClient;
          },
          setTimeout: () => nextClient,
        });
        return nextClient;
      };
      const transport = createNodeHttpsTransport({ request, cleanupTimeoutMs: 25 });
      const firstController = new AbortController();
      const first = transport.request(
        {
          url: "https://origin.example.com/a",
          pinnedIp: "93.184.216.34",
          tlsServerName: "origin.example.com",
          maxBytes: 10,
          timeoutMs: 100,
          deadlineAt: Date.now() + 100,
          signal: firstController.signal,
          quarantineKey,
        },
        sink,
      );
      const firstRejected = expect(first).rejects.toMatchObject({ code: "SAFE_FETCH_TIMEOUT" });
      await vi.advanceTimersByTimeAsync(100);
      await firstRejected;
      expect(stored).toBeUndefined();
      expect(completeCalls).toBe(1);
      expect(abortCalls).toBe(1);
      expect(abortSignals[0]).not.toBe(firstController.signal);
      expect(abortSignals[0]?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(50);
      expect(stored?.toString()).toBe("payload");
      const second = transport.request(
        {
          url: "https://origin.example.com/a",
          pinnedIp: "93.184.216.34",
          tlsServerName: "origin.example.com",
          maxBytes: 10,
          timeoutMs: 1_000,
          deadlineAt: Date.now() + 1_000,
          signal: new AbortController().signal,
          quarantineKey,
        },
        sink,
      );
      await expect(second).resolves.toMatchObject({
        bytes: 7,
        sha256: digest,
        receipt: { quarantineKey, bytes: 7, sha256: digest },
      });
      expect(completeCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
