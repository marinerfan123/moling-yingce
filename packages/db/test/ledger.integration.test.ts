import { describe, expect, it } from "vitest";

import { createBillingLedger } from "../src/index.js";

const tenantId = "tenant_12345678";
const projectId = "project_12345678";
const currency = "USD" as const;
const evidenceHash = `sha256:${"b".repeat(64)}`;

function createLedgerWithBudget(budgetMicros = "1000") {
  const ledger = createBillingLedger();
  ledger.freezeCurrencyPolicy({ tenantId, projectId, currency, budgetMicros });
  return ledger;
}

describe("billing ledger invariants", () => {
  it("prevents 100 concurrent reservations from exceeding project budget", async () => {
    const ledger = createLedgerWithBudget("1000");
    const results = await Promise.allSettled(
      Array.from({ length: 100 }, (_, index) =>
        Promise.resolve().then(() =>
          ledger.reserve({
            tenantId,
            projectId,
            jobId: `job_${String(index).padStart(8, "0")}`,
            attemptId: `attempt_${String(index).padStart(8, "0")}`,
            operationId: `op_${String(index).padStart(8, "0")}`,
            amountMicros: "11",
            currency,
          }),
        ),
      ),
    );

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(90);
    expect(rejected.length).toBeGreaterThan(0);
    const summary = ledger.summary(tenantId, projectId);
    expect(BigInt(summary.reservedMicros)).toBeLessThanOrEqual(BigInt(summary.budgetMicros));
    expect(BigInt(summary.availableMicros)).toBeGreaterThanOrEqual(0n);
  });

  it("deduplicates duplicate reservation operations and provider charge evidence", () => {
    const ledger = createLedgerWithBudget();
    const first = ledger.reserve({
      tenantId,
      projectId,
      jobId: "job_12345678",
      attemptId: "attempt_12345678",
      operationId: "op_duplicate",
      amountMicros: "100",
      currency,
    });
    const second = ledger.reserve({
      tenantId,
      projectId,
      jobId: "job_12345678",
      attemptId: "attempt_12345678",
      operationId: "op_duplicate",
      amountMicros: "100",
      currency,
    });
    expect(second.reservation.id).toBe(first.reservation.id);

    const charge = ledger.recordAttemptCharge({
      tenantId,
      projectId,
      attemptId: "attempt_12345678",
      providerChargeId: "provider-charge-1",
      amountMicros: "25",
      currency,
      evidenceHash,
    });
    const duplicate = ledger.recordAttemptCharge({
      tenantId,
      projectId,
      attemptId: "attempt_12345678",
      providerChargeId: "provider-charge-1",
      amountMicros: "25",
      currency,
      evidenceHash,
    });
    expect(duplicate).toMatchObject({ duplicate: true });
    expect(duplicate.movement.id).toBe(charge.movement.id);
  });

  it("rejects provider currency mismatch before reservation or charge", () => {
    const ledger = createLedgerWithBudget();
    expect(() =>
      ledger.reserve({
        tenantId,
        projectId,
        jobId: "job_12345678",
        attemptId: "attempt_12345678",
        operationId: "op_currency_mismatch",
        amountMicros: "100",
        currency: "CNY",
      }),
    ).toThrow("BILLING_CURRENCY_MISMATCH");
    expect(() =>
      ledger.recordAttemptCharge({
        tenantId,
        projectId,
        attemptId: "attempt_12345678",
        providerChargeId: "provider-charge-cny",
        amountMicros: "25",
        currency: "CNY",
        evidenceHash,
      }),
    ).toThrow("BILLING_CURRENCY_MISMATCH");
  });

  it("settles two retry attempts under one job for the exact billed sum", () => {
    const ledger = createLedgerWithBudget("10000");
    const first = ledger.reserve({
      tenantId,
      projectId,
      jobId: "job_12345678",
      attemptId: "attempt_11111111",
      operationId: "op_attempt_1",
      amountMicros: "1000",
      currency,
    });
    const second = ledger.reserve({
      tenantId,
      projectId,
      jobId: "job_12345678",
      attemptId: "attempt_22222222",
      operationId: "op_attempt_2",
      amountMicros: "250",
      currency,
    });
    ledger.settle({
      reservationId: first.reservation.id,
      operationId: "op_settle_1",
      amountMicros: "1000",
      currency,
      evidenceHash,
    });
    ledger.settle({
      reservationId: second.reservation.id,
      operationId: "op_settle_2",
      amountMicros: "250",
      currency,
      evidenceHash,
    });
    expect(ledger.summary(tenantId, projectId).spentMicros).toBe("1250");
  });

  it("expires only undispatched reservations and releases cancellation remainder", () => {
    const ledger = createLedgerWithBudget();
    const dispatched = ledger.reserve({
      tenantId,
      projectId,
      jobId: "job_12345678",
      attemptId: "attempt_12345678",
      operationId: "op_dispatched",
      amountMicros: "100",
      currency,
    });
    ledger.markDispatched(dispatched.reservation.id);
    expect(() =>
      ledger.expire({ reservationId: dispatched.reservation.id, operationId: "op_expire_dispatched", currency }),
    ).toThrow("BILLING_DISPATCHED_RESERVATION_CANNOT_EXPIRE");

    const canceled = ledger.reserve({
      tenantId,
      projectId,
      jobId: "job_87654321",
      attemptId: "attempt_87654321",
      operationId: "op_cancel",
      amountMicros: "200",
      currency,
    });
    const released = ledger.release({
      reservationId: canceled.reservation.id,
      operationId: "op_release_cancel",
      currency,
    });
    expect(released.reservation.state).toBe("released");
    const late = ledger.recordAttemptCharge({
      tenantId,
      projectId,
      attemptId: "attempt_87654321",
      providerChargeId: "late-provider-charge",
      amountMicros: "40",
      currency,
      evidenceHash,
      reservationId: canceled.reservation.id,
      lateAfterCancellation: true,
    });
    expect(late.movement.operation).toBe("cancellation_late_bill_adjustment");
    expect(ledger.summary(tenantId, projectId).spentMicros).toBe("40");
  });
});
