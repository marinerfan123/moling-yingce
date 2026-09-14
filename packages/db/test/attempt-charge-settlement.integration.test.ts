import { describe, expect, it } from "vitest";

import { createBillingLedger } from "../src/index.js";

const tenantId = "tenant_12345678";
const projectId = "project_12345678";
const currency = "USD" as const;
const evidenceHash = `sha256:${"c".repeat(64)}`;

function createLedger() {
  const ledger = createBillingLedger();
  ledger.freezeCurrencyPolicy({ tenantId, projectId, currency, budgetMicros: "10000" });
  return ledger;
}

describe("attempt charge settlement", () => {
  it("releases a canceled reservation and represents a later provider charge as budget overage", () => {
    const ledger = createLedger();
    const released = ledger.reserve({
      tenantId,
      projectId,
      jobId: "job_12345678",
      attemptId: "billable_attempt_released",
      operationId: "reserve_then_cancel",
      amountMicros: "1000",
      currency,
    }).reservation;
    ledger.release({ reservationId: released.id, operationId: "cancel_release", currency });
    ledger.reserve({
      tenantId,
      projectId,
      jobId: "job_12345678",
      attemptId: "billable_attempt_reused",
      operationId: "reserve_reused_capacity",
      amountMicros: "10000",
      currency,
    });

    ledger.recordAttemptCharge({
      tenantId,
      projectId,
      attemptId: "billable_attempt_released",
      reservationId: released.id,
      providerChargeId: "late_charge_after_reuse",
      amountMicros: "1000",
      currency,
      evidenceHash,
      lateAfterCancellation: true,
    });

    expect(ledger.summary(tenantId, projectId)).toMatchObject({
      reservedMicros: "10000",
      spentMicros: "1000",
      availableMicros: "-1000",
      overageMicros: "1000",
    });
    expect(() =>
      ledger.reserve({
        tenantId,
        projectId,
        jobId: "job_after_overage",
        attemptId: "billable_attempt_after_overage",
        operationId: "reserve_after_overage",
        amountMicros: "1",
        currency,
      }),
    ).toThrow("BILLING_BUDGET_EXCEEDED");
  });

  it("moves a full reservation to spend without double-deducting availability", () => {
    const ledger = createLedger();
    const reservation = ledger.reserve({
      tenantId,
      projectId,
      jobId: "job_12345678",
      attemptId: "billable_attempt_12345678",
      operationId: "reserve_full_charge",
      amountMicros: "1000",
      currency,
    }).reservation;

    ledger.recordAttemptCharge({
      tenantId,
      projectId,
      attemptId: "billable_attempt_12345678",
      reservationId: reservation.id,
      providerChargeId: "charge_full_reserve",
      amountMicros: "1000",
      currency,
      evidenceHash,
    });

    expect(ledger.summary(tenantId, projectId)).toMatchObject({
      reservedMicros: "0",
      spentMicros: "1000",
      availableMicros: "9000",
    });
  });

  it("settles independently reserved retry attempts and keeps duplicate provider charges immutable", () => {
    const ledger = createLedger();
    const first = ledger.reserve({
      tenantId,
      projectId,
      jobId: "job_12345678",
      attemptId: "billable_attempt_11111111",
      operationId: "reserve_retry_one",
      amountMicros: "1000",
      currency,
    }).reservation;
    const second = ledger.reserve({
      tenantId,
      projectId,
      jobId: "job_12345678",
      attemptId: "billable_attempt_22222222",
      operationId: "reserve_retry_two",
      amountMicros: "250",
      currency,
    }).reservation;
    const firstCharge = ledger.recordAttemptCharge({
      tenantId,
      projectId,
      attemptId: "billable_attempt_11111111",
      reservationId: first.id,
      providerChargeId: "charge_retry_one",
      amountMicros: "1000",
      currency,
      evidenceHash,
    });
    const duplicate = ledger.recordAttemptCharge({
      tenantId,
      projectId,
      attemptId: "billable_attempt_11111111",
      reservationId: first.id,
      providerChargeId: "charge_retry_one",
      amountMicros: "1000",
      currency,
      evidenceHash,
    });
    expect(() =>
      ledger.recordAttemptCharge({
        tenantId,
        projectId,
        attemptId: "billable_attempt_11111111",
        reservationId: first.id,
        providerChargeId: "charge_retry_one",
        amountMicros: "999",
        currency,
        evidenceHash,
      }),
    ).toThrow("BILLING_PROVIDER_CHARGE_IMMUTABLE");
    ledger.recordAttemptCharge({
      tenantId,
      projectId,
      attemptId: "billable_attempt_22222222",
      reservationId: second.id,
      providerChargeId: "charge_retry_two",
      amountMicros: "250",
      currency,
      evidenceHash,
    });

    expect(duplicate).toMatchObject({ duplicate: true, movement: { id: firstCharge.movement.id } });
    expect(ledger.summary(tenantId, projectId)).toMatchObject({
      reservedMicros: "0",
      spentMicros: "1250",
      availableMicros: "8750",
    });
  });
});
