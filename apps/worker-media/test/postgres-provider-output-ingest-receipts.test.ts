import { describe, expect, it } from "vitest";

import { PostgresProviderOutputIngestReceiptStore } from "../src/processors/postgres-provider-output-ingest-receipts.js";

describe("Postgres provider-output ingest receipts", () => {
  it("claims once, returns an existing completion, and makes failure recoverable", async () => {
    const calls: { sql: string; params: readonly unknown[] | undefined }[] = [];
    const replies = [
      [{ state: "claimed", quarantine_key: "quarantine/provider-output/ingest_123", claim_token: "claim-current" }],
      [
        {
          state: "completed",
          result_status: "quarantined",
          result_bytes: 6,
          result_sha256: `sha256:${"a".repeat(64)}`,
        },
      ],
      [],
      [],
    ];
    const store = new PostgresProviderOutputIngestReceiptStore({
      query: async (sql, params) => {
        calls.push({ sql, params });
        return replies.shift() ?? [];
      },
    });
    expect(store.kind).toBe("durable");
    await expect(store.claim("ingest_123")).resolves.toEqual({
      state: "claimed",
      quarantineKey: "quarantine/provider-output/ingest_123",
      claimToken: "claim-current",
    });
    await expect(store.claim("ingest_123")).resolves.toMatchObject({
      state: "completed",
      result: { status: "quarantined", bytes: 6 },
    });
    await store.complete("ingest_123", "claim-current", {
      status: "quarantined",
      instructionId: "ingest_123",
      bytes: 6,
      sha256: `sha256:${"a".repeat(64)}`,
    });
    await store.fail("ingest_123", "claim-current");
    expect(calls.map((call) => call.sql)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("claim_provider_output_ingest"),
        expect.stringContaining("complete_provider_output_ingest"),
        expect.stringContaining("fail_provider_output_ingest"),
      ]),
    );
  });
});
