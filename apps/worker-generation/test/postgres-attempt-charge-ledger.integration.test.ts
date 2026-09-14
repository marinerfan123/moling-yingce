import { describe, expect, it } from "vitest";

import { PostgresAttemptChargeLedger } from "../src/postgres-attempt-charge-ledger.js";

describe("PostgresAttemptChargeLedger", () => {
  it("calls the immutable work-binding SQL function without caller billing scope", async () => {
    const calls: Array<Readonly<{ sql: string; params: readonly unknown[] | undefined }>> = [];
    const ledger = new PostgresAttemptChargeLedger({
      query: async (sql, params) => {
        calls.push({ sql, params });
        return [{ ledger_movement_id: "ledger_12345678" }];
      },
    });

    await expect(
      ledger.recordAttemptCharge({
        generationAttemptId: "generation_attempt_12345678",
        workBinding: {
          eventId: "00000000-0000-0000-0000-000000000001",
          payloadHash: `sha256:${"d".repeat(64)}`,
        },
        providerChargeId: "charge_12345678",
        amountMicros: "1000001",
        currency: "USD",
        evidenceHash: `sha256:${"a".repeat(64)}`,
        lateAfterCancellation: false,
      }),
    ).resolves.toEqual({ duplicate: false });

    expect(calls).toEqual([
      {
        sql: expect.stringContaining("app.record_attempt_charge"),
        params: [
          "generation_attempt_12345678",
          "00000000-0000-0000-0000-000000000001",
          `sha256:${"d".repeat(64)}`,
          "charge_12345678",
          "1000001",
          "USD",
          `sha256:${"a".repeat(64)}`,
          false,
        ],
      },
    ]);
  });
});
