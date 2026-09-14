import { createHash, randomUUID } from "node:crypto";

export type BillingCurrency = "USD" | "CNY" | "EUR" | "JPY" | "KRW";
export type BillingReservationState = "reserved" | "dispatched" | "settled" | "released" | "expired";
export type BillingMovementOperation =
  | "reserve"
  | "settle"
  | "release"
  | "expire"
  | "record_attempt_charge"
  | "cancellation_late_bill_adjustment";

export type BillingReservation = Readonly<{
  id: string;
  tenantId: string;
  projectId: string;
  jobId: string;
  attemptId: string;
  operationId: string;
  amountMicros: string;
  remainingMicros: string;
  currency: BillingCurrency;
  state: BillingReservationState;
  dispatchedAt: string | null;
}>;

export type BillingMovement = Readonly<{
  id: string;
  tenantId: string;
  projectId: string;
  reservationId: string | null;
  attemptId: string;
  providerChargeId: string | null;
  operation: BillingMovementOperation;
  operationId: string;
  amountMicros: string;
  currency: BillingCurrency;
  evidenceHash: string;
  appendOnly: true;
}>;

export type BillingSummary = Readonly<{
  tenantId: string;
  projectId: string;
  currency: BillingCurrency;
  budgetMicros: string;
  reservedMicros: string;
  spentMicros: string;
  availableMicros: string;
  overageMicros: string;
  movements: readonly BillingMovement[];
}>;

type MutableReservation = {
  id: string;
  tenantId: string;
  projectId: string;
  jobId: string;
  attemptId: string;
  operationId: string;
  amountMicros: string;
  remainingMicros: string;
  currency: BillingCurrency;
  state: BillingReservationState;
  dispatchedAt: string | null;
};

type ProjectPolicy = { currency: BillingCurrency; budgetMicros: string };

const money = /^(0|[1-9][0-9]*)$/;
const sha256 = /^sha256:[a-f0-9]{64}$/;

const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
const add = (left: string, right: string) => (BigInt(left) + BigInt(right)).toString();
const sub = (left: string, right: string) => (BigInt(left) - BigInt(right)).toString();
const lte = (left: string, right: string) => BigInt(left) <= BigInt(right);
const hash = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

export class BillingLedger {
  readonly #policies = new Map<string, ProjectPolicy>();
  readonly #reservations = new Map<string, MutableReservation>();
  readonly #operationResults = new Map<string, unknown>();
  readonly #providerChargeMovements = new Map<string, BillingMovement>();
  readonly #movements: BillingMovement[] = [];

  freezeCurrencyPolicy(
    input: Readonly<{ tenantId: string; projectId: string; currency: BillingCurrency; budgetMicros: string }>,
  ) {
    this.assertMicros(input.budgetMicros);
    const key = this.projectKey(input.tenantId, input.projectId);
    const existing = this.#policies.get(key);
    if (existing && existing.currency !== input.currency) throw new Error("BILLING_CURRENCY_POLICY_IMMUTABLE");
    if (existing) return existing;
    const policy = { currency: input.currency, budgetMicros: input.budgetMicros };
    this.#policies.set(key, policy);
    return policy;
  }

  reserve(
    input: Readonly<{
      tenantId: string;
      projectId: string;
      jobId: string;
      attemptId: string;
      operationId: string;
      amountMicros: string;
      currency: BillingCurrency;
    }>,
  ) {
    this.assertMicros(input.amountMicros);
    const policy = this.requirePolicy(input.tenantId, input.projectId, input.currency);
    const operationKey = this.operationKey(input.tenantId, input.projectId, "reserve", input.operationId);
    const existing = this.#operationResults.get(operationKey);
    if (existing) return existing as { reservation: BillingReservation; movements: readonly BillingMovement[] };
    const summary = this.summary(input.tenantId, input.projectId);
    if (!lte(input.amountMicros, summary.availableMicros)) throw new Error("BILLING_BUDGET_EXCEEDED");
    const reservation: MutableReservation = {
      id: id("reservation"),
      tenantId: input.tenantId,
      projectId: input.projectId,
      jobId: input.jobId,
      attemptId: input.attemptId,
      operationId: input.operationId,
      amountMicros: input.amountMicros,
      remainingMicros: input.amountMicros,
      currency: policy.currency,
      state: "reserved",
      dispatchedAt: null,
    };
    this.#reservations.set(reservation.id, reservation);
    const movements = [
      this.append({
        ...input,
        reservationId: reservation.id,
        providerChargeId: null,
        operation: "reserve",
        evidenceHash: hash({ operation: "reserve", reservationId: reservation.id, amountMicros: input.amountMicros }),
      }),
    ];
    const result = { reservation: this.publicReservation(reservation), movements };
    this.#operationResults.set(operationKey, result);
    return result;
  }

  markDispatched(reservationId: string): BillingReservation {
    const reservation = this.requireReservation(reservationId);
    if (reservation.state !== "reserved") throw new Error("BILLING_RESERVATION_NOT_OPEN");
    reservation.state = "dispatched";
    reservation.dispatchedAt = new Date(0).toISOString();
    return this.publicReservation(reservation);
  }

  settle(
    input: Readonly<{
      reservationId: string;
      operationId: string;
      amountMicros: string;
      currency: BillingCurrency;
      evidenceHash: string;
    }>,
  ) {
    return this.consumeReservation(input, "settle", "settled");
  }

  release(
    input: Readonly<{
      reservationId: string;
      operationId: string;
      amountMicros?: string;
      currency: BillingCurrency;
      evidenceHash?: string;
    }>,
  ) {
    return this.consumeReservation(
      {
        ...input,
        amountMicros: input.amountMicros ?? this.requireReservation(input.reservationId).remainingMicros,
        evidenceHash: input.evidenceHash ?? hash(input),
      },
      "release",
      "released",
    );
  }

  expire(
    input: Readonly<{ reservationId: string; operationId: string; currency: BillingCurrency; evidenceHash?: string }>,
  ) {
    const reservation = this.requireReservation(input.reservationId);
    if (reservation.dispatchedAt) throw new Error("BILLING_DISPATCHED_RESERVATION_CANNOT_EXPIRE");
    return this.consumeReservation(
      { ...input, amountMicros: reservation.remainingMicros, evidenceHash: input.evidenceHash ?? hash(input) },
      "expire",
      "expired",
    );
  }

  recordAttemptCharge(
    input: Readonly<{
      tenantId: string;
      projectId: string;
      attemptId: string;
      providerChargeId: string;
      amountMicros: string;
      currency: BillingCurrency;
      evidenceHash: string;
      reservationId?: string;
      lateAfterCancellation?: boolean;
    }>,
  ) {
    this.assertMicros(input.amountMicros);
    this.assertEvidence(input.evidenceHash);
    this.requirePolicy(input.tenantId, input.projectId, input.currency);
    const chargeKey = `${input.tenantId}:${input.projectId}:${input.providerChargeId}`;
    const duplicate = this.#providerChargeMovements.get(chargeKey);
    if (duplicate) {
      if (
        duplicate.attemptId !== input.attemptId ||
        duplicate.amountMicros !== input.amountMicros ||
        duplicate.currency !== input.currency ||
        duplicate.evidenceHash !== input.evidenceHash
      )
        throw new Error("BILLING_PROVIDER_CHARGE_IMMUTABLE");
      return { movement: duplicate, duplicate: true };
    }
    const reservation = input.reservationId
      ? this.requireReservation(input.reservationId)
      : [...this.#reservations.values()].find(
          (candidate) =>
            candidate.tenantId === input.tenantId &&
            candidate.projectId === input.projectId &&
            candidate.attemptId === input.attemptId,
        );
    if (
      !reservation ||
      reservation.tenantId !== input.tenantId ||
      reservation.projectId !== input.projectId ||
      reservation.attemptId !== input.attemptId
    )
      throw new Error("BILLING_RESERVATION_SCOPE_MISMATCH");
    if (!input.lateAfterCancellation) {
      if (reservation.state !== "reserved" && reservation.state !== "dispatched")
        throw new Error("BILLING_RESERVATION_NOT_OPEN");
      if (!lte(input.amountMicros, reservation.remainingMicros)) throw new Error("BILLING_RESERVATION_AMOUNT_EXCEEDED");
      reservation.remainingMicros = sub(reservation.remainingMicros, input.amountMicros);
      if (reservation.remainingMicros === "0") reservation.state = "settled";
    }
    const operation = input.lateAfterCancellation ? "cancellation_late_bill_adjustment" : "record_attempt_charge";
    const movement = this.append({
      tenantId: input.tenantId,
      projectId: input.projectId,
      jobId: "job_charge_record",
      attemptId: input.attemptId,
      operationId: `provider:${input.providerChargeId}`,
      amountMicros: input.amountMicros,
      currency: input.currency,
      reservationId: reservation.id,
      providerChargeId: input.providerChargeId,
      operation,
      evidenceHash: input.evidenceHash,
    });
    this.#providerChargeMovements.set(chargeKey, movement);
    return { movement, duplicate: false };
  }

  summary(tenantId: string, projectId: string): BillingSummary {
    const policy = this.#policies.get(this.projectKey(tenantId, projectId));
    if (!policy) throw new Error("BILLING_POLICY_MISSING");
    const reservations = [...this.#reservations.values()].filter(
      (reservation) => reservation.tenantId === tenantId && reservation.projectId === projectId,
    );
    const movements = this.#movements.filter(
      (movement) => movement.tenantId === tenantId && movement.projectId === projectId,
    );
    const reservedMicros = reservations
      .filter((reservation) => reservation.state === "reserved" || reservation.state === "dispatched")
      .reduce((sum, reservation) => add(sum, reservation.remainingMicros), "0");
    const spentMicros = movements
      .filter(
        (movement) =>
          movement.operation === "settle" ||
          movement.operation === "record_attempt_charge" ||
          movement.operation === "cancellation_late_bill_adjustment",
      )
      .reduce((sum, movement) => add(sum, movement.amountMicros), "0");
    return {
      tenantId,
      projectId,
      currency: policy.currency,
      budgetMicros: policy.budgetMicros,
      reservedMicros,
      spentMicros,
      availableMicros: sub(sub(policy.budgetMicros, reservedMicros), spentMicros),
      overageMicros: lte(add(reservedMicros, spentMicros), policy.budgetMicros)
        ? "0"
        : sub(add(reservedMicros, spentMicros), policy.budgetMicros),
      movements,
    };
  }

  private consumeReservation(
    input: Readonly<{
      reservationId: string;
      operationId: string;
      amountMicros: string;
      currency: BillingCurrency;
      evidenceHash: string;
    }>,
    operation: "settle" | "release" | "expire",
    closedState: "settled" | "released" | "expired",
  ) {
    this.assertMicros(input.amountMicros);
    this.assertEvidence(input.evidenceHash);
    const reservation = this.requireReservation(input.reservationId);
    this.requirePolicy(reservation.tenantId, reservation.projectId, input.currency);
    const operationKey = this.operationKey(reservation.tenantId, reservation.projectId, operation, input.operationId);
    const existing = this.#operationResults.get(operationKey);
    if (existing) return existing as { reservation: BillingReservation; movements: readonly BillingMovement[] };
    if (reservation.state !== "reserved" && reservation.state !== "dispatched")
      throw new Error("BILLING_RESERVATION_NOT_OPEN");
    if (!lte(input.amountMicros, reservation.remainingMicros)) throw new Error("BILLING_RESERVATION_AMOUNT_EXCEEDED");
    reservation.remainingMicros = sub(reservation.remainingMicros, input.amountMicros);
    if (reservation.remainingMicros === "0") reservation.state = closedState;
    const movements = [
      this.append({
        tenantId: reservation.tenantId,
        projectId: reservation.projectId,
        jobId: reservation.jobId,
        attemptId: reservation.attemptId,
        reservationId: reservation.id,
        providerChargeId: null,
        operation,
        operationId: input.operationId,
        amountMicros: input.amountMicros,
        currency: reservation.currency,
        evidenceHash: input.evidenceHash,
      }),
    ];
    const result = { reservation: this.publicReservation(reservation), movements };
    this.#operationResults.set(operationKey, result);
    return result;
  }

  private append(input: Omit<BillingMovement, "id" | "appendOnly"> & { readonly jobId: string }): BillingMovement {
    const movement: BillingMovement = {
      id: id("movement"),
      appendOnly: true,
      tenantId: input.tenantId,
      projectId: input.projectId,
      reservationId: input.reservationId,
      attemptId: input.attemptId,
      providerChargeId: input.providerChargeId,
      operation: input.operation,
      operationId: input.operationId,
      amountMicros: input.amountMicros,
      currency: input.currency,
      evidenceHash: input.evidenceHash,
    };
    this.#movements.push(movement);
    return movement;
  }

  private requirePolicy(tenantId: string, projectId: string, currency: BillingCurrency) {
    const policy = this.#policies.get(this.projectKey(tenantId, projectId));
    if (!policy) throw new Error("BILLING_POLICY_MISSING");
    if (policy.currency !== currency) throw new Error("BILLING_CURRENCY_MISMATCH");
    return policy;
  }

  private requireReservation(reservationId: string) {
    const reservation = this.#reservations.get(reservationId);
    if (!reservation) throw new Error("BILLING_RESERVATION_NOT_FOUND");
    return reservation;
  }

  private assertMicros(value: string) {
    if (!money.test(value)) throw new Error("BILLING_AMOUNT_MICROS_INVALID");
  }

  private assertEvidence(value: string) {
    if (!sha256.test(value)) throw new Error("BILLING_EVIDENCE_HASH_INVALID");
  }

  private operationKey(tenantId: string, projectId: string, operation: string, operationId: string) {
    return `${tenantId}:${projectId}:${operation}:${operationId}`;
  }

  private projectKey(tenantId: string, projectId: string) {
    return `${tenantId}:${projectId}`;
  }

  private publicReservation(reservation: MutableReservation): BillingReservation {
    return { ...reservation };
  }
}

export function createBillingLedger() {
  return new BillingLedger();
}
