import { describe, expect, it } from "vitest";

import {
  AttemptChargeRecordSchema,
  BillingContractError,
  BillingCurrencyPolicySchema,
  BillingMovementSetSchema,
  RecordAttemptChargeRequestSchema,
  ReserveUsageRequestSchema,
  assertIdempotentAttemptCharge,
  attemptChargeIdempotencyKey,
  ensureCurrencyMatches,
  ledgerBalanceMicros,
} from "./index.js";

const now = "2026-08-25T00:00:00.000Z";
const sha = `sha256:${"d".repeat(64)}`;
const tenantId = "tenant_12345678";
const projectId = "project_12345678";
const jobId = "job_12345678";

const movementBase = {
  tenantId,
  projectId,
  operationId: "op_12345678",
  operation: "settle" as const,
  amountMicros: "1200000",
  currency: "USD",
  evidenceHash: sha,
  occurredAt: now,
};

describe("billing contracts", () => {
  it("freezes one project currency policy and rejects currency mismatch", () => {
    const policy = BillingCurrencyPolicySchema.parse({
      id: "billpolicy_12345678",
      tenantId,
      projectId,
      currency: "USD",
      version: 1,
      frozenAt: now,
      frozenByUserId: "user_12345678",
    });

    expect(Object.isFrozen(policy)).toBe(true);
    expect(Reflect.set(policy, "currency", "CNY")).toBe(false);
    expect(() => ensureCurrencyMatches(policy, "CNY")).toThrow(BillingContractError);
    expect(() => BillingCurrencyPolicySchema.parse({ ...policy, currency: "usd" })).toThrow();
  });

  it("keeps money micros as decimal strings at the API boundary", () => {
    expect(
      ReserveUsageRequestSchema.parse({
        tenantId,
        projectId,
        jobId,
        operationId: "op_12345678",
        amountMicros: "3000",
        currency: "USD",
        expiresAt: now,
      }).amountMicros,
    ).toBe("3000");

    expect(() =>
      ReserveUsageRequestSchema.parse({
        tenantId,
        projectId,
        jobId,
        operationId: "op_12345678",
        amountMicros: 3000,
        currency: "USD",
        expiresAt: now,
      }),
    ).toThrow();
    expect(() =>
      ReserveUsageRequestSchema.parse({
        tenantId,
        projectId,
        jobId,
        operationId: "op_12345678",
        amountMicros: "3.5",
        currency: "USD",
        expiresAt: now,
      }),
    ).toThrow();
  });

  it("makes recordAttemptCharge idempotent on attempt and provider charge identity", () => {
    const request = RecordAttemptChargeRequestSchema.parse({
      attemptId: "attempt_12345678",
      providerChargeId: "provider-charge-1",
      amountMicros: "3000",
      currency: "USD",
      evidenceHash: sha,
    });
    const record = AttemptChargeRecordSchema.parse({
      ...request,
      id: "charge_12345678",
      tenantId,
      projectId,
      jobId,
      recordedAt: now,
    });

    expect(attemptChargeIdempotencyKey(request)).toBe("attempt_12345678:provider-charge-1");
    expect(() => assertIdempotentAttemptCharge(record, request)).not.toThrow();
    expect(() => assertIdempotentAttemptCharge(record, { ...request, amountMicros: "3001" })).toThrow(
      BillingContractError,
    );
    expect(() => assertIdempotentAttemptCharge(record, { ...request, currency: "CNY" })).toThrow(BillingContractError);
  });

  it("allows two retry attempts under one job to append distinct exact charges", () => {
    const first = AttemptChargeRecordSchema.parse({
      id: "charge_11111111",
      tenantId,
      projectId,
      jobId,
      attemptId: "attempt_11111111",
      providerChargeId: "provider-charge-a",
      amountMicros: "1000000",
      currency: "USD",
      evidenceHash: sha,
      recordedAt: now,
    });
    const second = AttemptChargeRecordSchema.parse({
      ...first,
      id: "charge_22222222",
      attemptId: "attempt_22222222",
      providerChargeId: "provider-charge-b",
      amountMicros: "250000",
    });

    expect(first.jobId).toBe(second.jobId);
    expect(BigInt(first.amountMicros) + BigInt(second.amountMicros)).toBe(1_250_000n);
    expect(attemptChargeIdempotencyKey(first)).not.toBe(attemptChargeIdempotencyKey(second));
  });

  it("requires every debit, credit, and late-cancellation adjustment movement set to balance", () => {
    const balanced = BillingMovementSetSchema.parse({
      operationId: "op_12345678",
      movements: [
        { ...movementBase, id: "movement_11111111", type: "debit", account: "usage_expense" },
        { ...movementBase, id: "movement_22222222", type: "credit", account: "provider_payable" },
      ],
    });

    expect(ledgerBalanceMicros(balanced.movements)).toBe(0n);
    expect(() =>
      BillingMovementSetSchema.parse({
        operationId: "op_12345678",
        movements: [
          { ...movementBase, id: "movement_33333333", type: "debit", account: "usage_expense" },
          { ...movementBase, id: "movement_44444444", type: "credit", account: "provider_payable", amountMicros: "1" },
        ],
      }),
    ).toThrow();

    expect(
      BillingMovementSetSchema.parse({
        operationId: "op_12345678",
        movements: [
          {
            ...movementBase,
            id: "movement_55555555",
            type: "adjustment",
            direction: "debit",
            account: "billing_adjustment",
            reason: "late_cancellation_bill",
          },
          {
            ...movementBase,
            id: "movement_66666666",
            type: "adjustment",
            direction: "credit",
            account: "provider_payable",
            reason: "late_cancellation_bill",
          },
        ],
      }).movements,
    ).toHaveLength(2);
  });

  it("rejects mixed currency movement sets before persistence", () => {
    expect(() =>
      BillingMovementSetSchema.parse({
        operationId: "op_12345678",
        movements: [
          { ...movementBase, id: "movement_77777777", type: "debit", account: "usage_expense" },
          { ...movementBase, id: "movement_88888888", type: "credit", account: "provider_payable", currency: "CNY" },
        ],
      }),
    ).toThrow();
  });
});
