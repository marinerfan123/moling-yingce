import { describe, expect, it } from "vitest";

import { BillingReconciler } from "../src/billing-reconciler.js";

describe("attempt billing reconciliation", () => {
  it("sends a verified work claim with only generation attempt identity and charge evidence", async () => {
    const calls: string[] = [];
    const charges: unknown[] = [];
    const reconciler = new BillingReconciler({
      recordAttemptCharge: async (charge) => {
        calls.push(`${charge.generationAttemptId}:${charge.providerChargeId}`);
        charges.push(charge);
        return { duplicate: false };
      },
    });
    const input = {
      generationAttemptId: "generation_attempt_12345678",
      workBinding: {
        eventId: "00000000-0000-0000-0000-000000000001",
        payloadHash: `sha256:${"b".repeat(64)}`,
      },
      providerChargeId: "charge_12345678",
      amountMicros: "1000001",
      currency: "USD" as const,
      evidenceHash: `sha256:${"a".repeat(64)}`,
      canceled: true,
    };
    await expect(reconciler.reconcile(input as never)).resolves.toMatchObject({
      adjustment: true,
      unselectedCandidate: true,
    });
    await expect(
      reconciler.reconcile({
        ...input,
        generationAttemptId: "generation_attempt_87654321",
        workBinding: {
          eventId: "00000000-0000-0000-0000-000000000002",
          payloadHash: `sha256:${"c".repeat(64)}`,
        },
      } as never),
    ).resolves.toMatchObject({ adjustment: true, unselectedCandidate: true });
    expect(calls).toEqual([
      "generation_attempt_12345678:charge_12345678",
      "generation_attempt_87654321:charge_12345678",
    ]);
    expect(charges).toEqual([
      {
        generationAttemptId: "generation_attempt_12345678",
        workBinding: input.workBinding,
        providerChargeId: "charge_12345678",
        amountMicros: "1000001",
        currency: "USD",
        evidenceHash: `sha256:${"a".repeat(64)}`,
        lateAfterCancellation: true,
      },
      {
        generationAttemptId: "generation_attempt_87654321",
        workBinding: {
          eventId: "00000000-0000-0000-0000-000000000002",
          payloadHash: `sha256:${"c".repeat(64)}`,
        },
        providerChargeId: "charge_12345678",
        amountMicros: "1000001",
        currency: "USD",
        evidenceHash: `sha256:${"a".repeat(64)}`,
        lateAfterCancellation: true,
      },
    ]);
  });
});
