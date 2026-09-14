import { z } from "zod";

import { JobIdSchema, ProjectIdSchema, TenantIdSchema, UserIdSchema } from "./ids.js";
import { MoneyMicrosSchema } from "./money.js";

const opaqueId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-zA-Z0-9][a-zA-Z0-9_-]{7,}$`), `${prefix} id must be opaque and prefixed`);

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const BillingPolicyIdSchema = opaqueId("billpolicy");
export const BillingReservationIdSchema = opaqueId("reservation");
export const BillingMovementIdSchema = opaqueId("movement");
export const BillableAttemptIdSchema = opaqueId("attempt");
export const BillingOperationIdSchema = opaqueId("op");

export const Iso4217CurrencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "currency must be an uppercase ISO 4217 code")
  .refine((currency) => currency !== "XXX", "currency must be billable");

export const BillingContractErrorCodeSchema = z.enum([
  "BILLING_AMOUNT_NOT_DECIMAL_STRING",
  "BILLING_CURRENCY_MISMATCH",
  "BILLING_IDEMPOTENCY_CONFLICT",
  "BILLING_LEDGER_UNBALANCED",
]);

export class BillingContractError extends Error {
  constructor(
    readonly code: z.infer<typeof BillingContractErrorCodeSchema>,
    message: string,
  ) {
    super(message);
    this.name = "BillingContractError";
  }
}

export const BillingCurrencyPolicySchema = z
  .object({
    id: BillingPolicyIdSchema,
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    currency: Iso4217CurrencySchema,
    version: z.literal(1),
    frozenAt: z.string().datetime(),
    frozenByUserId: UserIdSchema,
  })
  .strict()
  .readonly();

export const BillingReservationStateSchema = z.enum(["reserved", "settled", "released", "expired"]);

export const BillingReservationSchema = z
  .object({
    id: BillingReservationIdSchema,
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    jobId: JobIdSchema,
    amountMicros: MoneyMicrosSchema,
    currency: Iso4217CurrencySchema,
    state: BillingReservationStateSchema,
    expiresAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  })
  .strict()
  .readonly();

export const ReserveUsageRequestSchema = z
  .object({
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    jobId: JobIdSchema,
    operationId: BillingOperationIdSchema,
    amountMicros: MoneyMicrosSchema,
    currency: Iso4217CurrencySchema,
    expiresAt: z.string().datetime(),
  })
  .strict()
  .readonly();

export const SettleUsageRequestSchema = z
  .object({
    reservationId: BillingReservationIdSchema,
    operationId: BillingOperationIdSchema,
    settledMicros: MoneyMicrosSchema,
    currency: Iso4217CurrencySchema,
    evidenceHash: Sha256Schema,
  })
  .strict()
  .readonly();

export const ReleaseUsageRequestSchema = z
  .object({
    reservationId: BillingReservationIdSchema,
    operationId: BillingOperationIdSchema,
    releasedMicros: MoneyMicrosSchema,
    currency: Iso4217CurrencySchema,
    reason: z.enum(["user_canceled", "provider_rejected", "unused_budget"]),
  })
  .strict()
  .readonly();

export const ExpireUsageReservationRequestSchema = z
  .object({
    reservationId: BillingReservationIdSchema,
    operationId: BillingOperationIdSchema,
    expiredMicros: MoneyMicrosSchema,
    currency: Iso4217CurrencySchema,
    expiredAt: z.string().datetime(),
  })
  .strict()
  .readonly();

const RecordAttemptChargeShape = {
  attemptId: BillableAttemptIdSchema,
  providerChargeId: z.string().trim().min(1).max(160),
  amountMicros: MoneyMicrosSchema,
  currency: Iso4217CurrencySchema,
  evidenceHash: Sha256Schema,
} as const;

export const RecordAttemptChargeRequestSchema = z.object(RecordAttemptChargeShape).strict().readonly();

export const AttemptChargeRecordSchema = z
  .object({
    ...RecordAttemptChargeShape,
    id: opaqueId("charge"),
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    jobId: JobIdSchema,
    recordedAt: z.string().datetime(),
  })
  .strict()
  .readonly();

export const BillingOperationSchema = z.enum(["reserve", "settle", "release", "expire", "record_attempt_charge"]);
export const BillingMovementTypeSchema = z.enum(["debit", "credit", "adjustment"]);
export const BillingAdjustmentReasonSchema = z.enum([
  "late_cancellation_bill",
  "provider_refund",
  "manual_correction",
  "provider_reconciliation",
]);
export const BillingMovementAccountSchema = z.enum([
  "tenant_budget",
  "reservation_hold",
  "usage_expense",
  "provider_payable",
  "provider_refund",
  "billing_adjustment",
]);

const BillingMovementBaseSchema = z.object({
  id: BillingMovementIdSchema,
  tenantId: TenantIdSchema,
  projectId: ProjectIdSchema,
  reservationId: BillingReservationIdSchema.optional(),
  attemptId: BillableAttemptIdSchema.optional(),
  operationId: BillingOperationIdSchema,
  operation: BillingOperationSchema,
  account: BillingMovementAccountSchema,
  amountMicros: MoneyMicrosSchema,
  currency: Iso4217CurrencySchema,
  evidenceHash: Sha256Schema,
  occurredAt: z.string().datetime(),
});

const BillingDebitMovementSchema = BillingMovementBaseSchema.extend({
  type: z.literal("debit"),
}).strict();

const BillingCreditMovementSchema = BillingMovementBaseSchema.extend({
  type: z.literal("credit"),
}).strict();

const BillingAdjustmentMovementSchema = BillingMovementBaseSchema.extend({
  type: z.literal("adjustment"),
  direction: z.enum(["debit", "credit"]),
  reason: BillingAdjustmentReasonSchema,
}).strict();

export const BillingMovementSchema = z
  .discriminatedUnion("type", [
    BillingDebitMovementSchema,
    BillingCreditMovementSchema,
    BillingAdjustmentMovementSchema,
  ])
  .readonly();

export const BillingMovementSetSchema = z
  .object({
    operationId: BillingOperationIdSchema,
    movements: z.array(BillingMovementSchema).min(2).readonly(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const currencies = new Set(value.movements.map((movement) => movement.currency));
    if (currencies.size > 1) {
      ctx.addIssue({ code: "custom", message: "ledger movement set cannot mix currencies" });
    }
    if (ledgerBalanceMicros(value.movements) !== 0n) {
      ctx.addIssue({ code: "custom", message: "ledger movement set must balance to zero" });
    }
  })
  .readonly();

export function ensureCurrencyMatches(policy: z.infer<typeof BillingCurrencyPolicySchema>, currency: string): void {
  if (policy.currency !== currency) {
    throw new BillingContractError(
      "BILLING_CURRENCY_MISMATCH",
      `billing currency ${currency} does not match project policy ${policy.currency}`,
    );
  }
}

export function ledgerBalanceMicros(movements: readonly z.infer<typeof BillingMovementSchema>[]): bigint {
  return movements.reduce((sum, movement) => {
    const amount = BigInt(movement.amountMicros);
    if (movement.type === "credit") return sum - amount;
    if (movement.type === "adjustment" && movement.direction === "credit") return sum - amount;
    return sum + amount;
  }, 0n);
}

export function assertLedgerBalances(movements: readonly z.infer<typeof BillingMovementSchema>[]): void {
  if (ledgerBalanceMicros(movements) !== 0n) {
    throw new BillingContractError("BILLING_LEDGER_UNBALANCED", "ledger movement set must balance to zero");
  }
}

export function attemptChargeIdempotencyKey(request: z.infer<typeof RecordAttemptChargeRequestSchema>): string {
  return `${request.attemptId}:${request.providerChargeId}`;
}

export function assertIdempotentAttemptCharge(
  existing: z.infer<typeof AttemptChargeRecordSchema>,
  incoming: z.infer<typeof RecordAttemptChargeRequestSchema>,
): void {
  if (existing.attemptId !== incoming.attemptId || existing.providerChargeId !== incoming.providerChargeId) {
    throw new BillingContractError("BILLING_IDEMPOTENCY_CONFLICT", "attempt charge identity does not match");
  }
  if (
    existing.amountMicros !== incoming.amountMicros ||
    existing.currency !== incoming.currency ||
    existing.evidenceHash !== incoming.evidenceHash
  ) {
    throw new BillingContractError("BILLING_IDEMPOTENCY_CONFLICT", "attempt charge replay changed immutable fields");
  }
}

export type BillingCurrencyPolicy = z.infer<typeof BillingCurrencyPolicySchema>;
export type BillingReservation = z.infer<typeof BillingReservationSchema>;
export type ReserveUsageRequest = z.infer<typeof ReserveUsageRequestSchema>;
export type SettleUsageRequest = z.infer<typeof SettleUsageRequestSchema>;
export type ReleaseUsageRequest = z.infer<typeof ReleaseUsageRequestSchema>;
export type ExpireUsageReservationRequest = z.infer<typeof ExpireUsageReservationRequestSchema>;
export type RecordAttemptChargeRequest = z.infer<typeof RecordAttemptChargeRequestSchema>;
export type AttemptChargeRecord = z.infer<typeof AttemptChargeRecordSchema>;
export type BillingMovement = z.infer<typeof BillingMovementSchema>;
export type BillingMovementSet = z.infer<typeof BillingMovementSetSchema>;
