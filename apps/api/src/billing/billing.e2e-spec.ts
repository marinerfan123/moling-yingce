import { describe, expect, it } from "vitest";

import { apiControllers, apiModules, apiSecurityPolicies } from "../app.module.js";
import { BillingController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";

const principal = {
  tenantId: "tenant_12345678",
  userId: "user_12345678",
  memberships: [
    {
      projectId: "project_12345678",
      active: true,
      role: "Owner",
      capabilities: ["generation:spend"],
    },
  ],
} as const;

const evidenceHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("billing API", () => {
  it("registers the billing module and controller", () => {
    expect(apiControllers).toContain("BillingController");
    expect(apiModules).toContain("BillingModule");
  });

  it("exposes a project billing summary without secrets", () => {
    const summary = new BillingController().summary(principal, "project_12345678");
    expect(summary).toMatchObject({
      tenantId: "tenant_12345678",
      projectId: "project_12345678",
      currency: "USD",
      reservedMicros: "0",
      spentMicros: "0",
    });
    expect(JSON.stringify({ summary, apiSecurityPolicies })).not.toMatch(/secret|token|sk-|authorization/i);
  });

  it("reserves, settles, releases and expires exact decimal micros", () => {
    const controller = new BillingController(new BillingService(() => new Date("2026-08-25T00:00:00.000Z")));
    const reserved = controller.reserve(principal, {
      projectId: "project_12345678",
      attemptId: "attempt_12345678",
      operationId: "op_reserve_12345678",
      amountMicros: "1000",
      currency: "USD",
      providerCurrency: "USD",
    });
    expect(reserved.reservation.amountMicros).toBe("1000");
    expect(reserved.movement.amountMicros).toBe("1000");
    const settled = controller.settle(principal, reserved.reservation.id, {
      operationId: "op_settle_12345678",
      amountMicros: "400",
      currency: "USD",
      evidenceHash,
    });
    expect(settled.reservation.remainingMicros).toBe("600");
    const released = controller.release(principal, reserved.reservation.id, {
      operationId: "op_release_12345678",
      amountMicros: "300",
      currency: "USD",
    });
    expect(released.reservation.remainingMicros).toBe("300");
    const expired = controller.expire(principal, reserved.reservation.id, {
      operationId: "op_expire_12345678",
      currency: "USD",
    });
    expect(expired.reservation.status).toBe("expired");
    const summary = controller.summary(principal, "project_12345678");
    expect(summary.spentMicros).toBe("400");
    expect(summary.releasedMicros).toBe("300");
    expect(summary.expiredMicros).toBe("300");
  });

  it("records provider charges idempotently and rejects currency mismatch before charge", () => {
    const controller = new BillingController();
    expect(() =>
      controller.recordAttemptCharge(principal, {
        projectId: "project_12345678",
        attemptId: "attempt_12345678",
        providerChargeId: "charge_bad_currency",
        amountMicros: "100",
        currency: "USD",
        providerCurrency: "CNY",
        evidenceHash,
      }),
    ).toThrow("BILLING_PROVIDER_CURRENCY_MISMATCH");
    const recorded = controller.recordAttemptCharge(principal, {
      projectId: "project_12345678",
      attemptId: "attempt_12345678",
      providerChargeId: "charge_12345678",
      amountMicros: "100",
      currency: "USD",
      providerCurrency: "USD",
      evidenceHash,
    });
    const duplicate = controller.recordAttemptCharge(principal, {
      projectId: "project_12345678",
      attemptId: "attempt_12345678",
      providerChargeId: "charge_12345678",
      amountMicros: "100",
      currency: "USD",
      evidenceHash,
    });
    expect(duplicate).toMatchObject({ duplicate: true });
    expect(duplicate.movement.id).toBe(recorded.movement.id);
  });

  it("denies users without project membership or spend capability", () => {
    const controller = new BillingController();
    expect(() => controller.summary({ ...principal, memberships: [] }, "project_12345678")).toThrow(
      "PROJECT_MEMBERSHIP_MISSING",
    );
    expect(() =>
      controller.reserve(
        { ...principal, memberships: [{ projectId: "project_12345678", active: true, role: "Viewer" }] },
        {
          projectId: "project_12345678",
          attemptId: "attempt_12345678",
          operationId: "op_reserve_12345678",
          amountMicros: "100",
          currency: "USD",
        },
      ),
    ).toThrow("BILLING_SPEND_NOT_AUTHORIZED");
  });

  it("rejects number or float money at the API boundary", () => {
    expect(() =>
      new BillingController().reserve(principal, {
        projectId: "project_12345678",
        attemptId: "attempt_12345678",
        operationId: "op_float_12345678",
        amountMicros: "1.5",
        currency: "USD",
      }),
    ).toThrow();
  });
});
