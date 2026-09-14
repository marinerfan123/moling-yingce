import { createHash, randomUUID } from "node:crypto";

export type ProviderCurrency = "USD" | "CNY" | "EUR" | "JPY" | "KRW";

export type BillingPrincipal = Readonly<{
  tenantId: string;
  userId: string;
  memberships: readonly { projectId: string; role?: string; active: boolean; capabilities?: readonly string[] }[];
}>;

export type BillingMovementKind =
  | "reservation"
  | "settlement"
  | "release"
  | "expiration"
  | "attempt_charge"
  | "cancellation_late_bill_adjustment";

export type BillingReservationStatus = "reserved" | "settled" | "released" | "expired";

export type BillingMovement = Readonly<{
  id: string;
  tenantId: string;
  projectId: string;
  attemptId: string;
  reservationId: string | null;
  operationId: string;
  providerChargeId: string | null;
  kind: BillingMovementKind;
  amountMicros: string;
  currency: ProviderCurrency;
  evidenceHash: string;
  createdAt: string;
}>;

type Reservation = {
  id: string;
  tenantId: string;
  projectId: string;
  attemptId: string;
  operationId: string;
  amountMicros: string;
  remainingMicros: string;
  currency: ProviderCurrency;
  status: BillingReservationStatus;
  createdAt: string;
  expiresAt: string;
};

export type PublicBillingReservation = Readonly<Reservation>;

type ReservationOperationResult = Readonly<{
  reservation: PublicBillingReservation;
  movement: BillingMovement;
}>;

export type BillingSummary = Readonly<{
  tenantId: string;
  projectId: string;
  currency: ProviderCurrency;
  budgetMicros: string;
  reservedMicros: string;
  spentMicros: string;
  releasedMicros: string;
  expiredMicros: string;
  availableMicros: string;
  movements: readonly BillingMovement[];
}>;

export type ReserveInput = Readonly<{
  projectId: string;
  attemptId: string;
  operationId: string;
  amountMicros: string;
  currency: ProviderCurrency;
  providerCurrency?: ProviderCurrency;
  expiresAt?: string;
}>;

export type ReservationChangeInput = Readonly<{
  operationId: string;
  amountMicros?: string;
  currency: ProviderCurrency;
  providerCurrency?: ProviderCurrency;
  evidenceHash?: string;
}>;

export type AttemptChargeInput = Readonly<{
  projectId: string;
  attemptId: string;
  providerChargeId: string;
  amountMicros: string;
  currency: ProviderCurrency;
  providerCurrency?: ProviderCurrency;
  evidenceHash: string;
  reservationId?: string;
  lateAfterCancellation?: boolean;
}>;

const DEFAULT_BUDGET_MICROS = "10000000000";
const CURRENCIES = new Set<ProviderCurrency>(["USD", "CNY", "EUR", "JPY", "KRW"]);
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const MONEY_MICROS = /^(0|[1-9][0-9]*)$/;

const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
const evidenceHashFor = (value: unknown) =>
  `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const add = (left: string, right: string) => (BigInt(left) + BigInt(right)).toString();
const sub = (left: string, right: string) => (BigInt(left) - BigInt(right)).toString();
const lte = (left: string, right: string) => BigInt(left) <= BigInt(right);

export class BillingService {
  readonly #policies = new Map<string, { currency: ProviderCurrency; budgetMicros: string }>();
  readonly #reservations = new Map<string, Reservation>();
  readonly #movements: BillingMovement[] = [];
  readonly #operationResults = new Map<string, ReservationOperationResult>();
  readonly #providerCharges = new Map<string, BillingMovement>();

  constructor(private readonly now = () => new Date()) {}

  summary(principal: BillingPrincipal, input: Readonly<{ projectId: string }>): BillingSummary {
    this.assertAccess(principal, input.projectId);
    const policy = this.policyFor(principal.tenantId, input.projectId);
    const projectMovements = this.#movements.filter(
      (movement) => movement.tenantId === principal.tenantId && movement.projectId === input.projectId,
    );
    const sum = (kinds: readonly BillingMovementKind[]) =>
      projectMovements
        .filter((movement) => kinds.includes(movement.kind))
        .reduce((total, movement) => add(total, movement.amountMicros), "0");
    const reservedMicros = [...this.#reservations.values()]
      .filter(
        (reservation) =>
          reservation.tenantId === principal.tenantId &&
          reservation.projectId === input.projectId &&
          reservation.status === "reserved",
      )
      .reduce((total, reservation) => add(total, reservation.remainingMicros), "0");
    const spentMicros = sum(["settlement", "attempt_charge", "cancellation_late_bill_adjustment"]);
    const releasedMicros = sum(["release"]);
    const expiredMicros = sum(["expiration"]);
    const availableMicros = sub(sub(policy.budgetMicros, reservedMicros), spentMicros);
    return {
      tenantId: principal.tenantId,
      projectId: input.projectId,
      currency: policy.currency,
      budgetMicros: policy.budgetMicros,
      reservedMicros,
      spentMicros,
      releasedMicros,
      expiredMicros,
      availableMicros,
      movements: projectMovements,
    };
  }

  reserve(principal: BillingPrincipal, input: ReserveInput) {
    this.assertSpendAccess(principal, input.projectId);
    this.assertMicros(input.amountMicros);
    const policy = this.assertCurrency(principal.tenantId, input.projectId, input.currency, input.providerCurrency);
    const operationKey = this.operationKey(principal.tenantId, input.projectId, input.operationId, "reserve");
    const existing = this.#operationResults.get(operationKey);
    if (existing) return existing;
    const summary = this.summary(principal, { projectId: input.projectId });
    if (!lte(input.amountMicros, summary.availableMicros)) throw new Error("BILLING_BUDGET_EXCEEDED");
    const now = this.now().toISOString();
    const reservation: Reservation = {
      id: id("reservation"),
      tenantId: principal.tenantId,
      projectId: input.projectId,
      attemptId: input.attemptId,
      operationId: input.operationId,
      amountMicros: input.amountMicros,
      remainingMicros: input.amountMicros,
      currency: policy.currency,
      status: "reserved",
      createdAt: now,
      expiresAt: input.expiresAt ?? new Date(this.now().getTime() + 15 * 60 * 1000).toISOString(),
    };
    this.#reservations.set(reservation.id, reservation);
    const movement = this.appendMovement({
      tenantId: principal.tenantId,
      projectId: input.projectId,
      attemptId: input.attemptId,
      reservationId: reservation.id,
      operationId: input.operationId,
      providerChargeId: null,
      kind: "reservation",
      amountMicros: input.amountMicros,
      currency: policy.currency,
      evidenceHash: evidenceHashFor({ reservationId: reservation.id, amountMicros: input.amountMicros }),
    });
    const result: ReservationOperationResult = { reservation: this.publicReservation(reservation), movement };
    this.#operationResults.set(operationKey, result);
    return result;
  }

  settle(principal: BillingPrincipal, reservationId: string, input: ReservationChangeInput) {
    const reservation = this.requireReservation(principal, reservationId);
    this.assertSpendAccess(principal, reservation.projectId);
    const amountMicros = input.amountMicros ?? reservation.remainingMicros;
    this.assertMicros(amountMicros);
    this.assertCurrency(reservation.tenantId, reservation.projectId, input.currency, input.providerCurrency);
    const operationKey = this.operationKey(reservation.tenantId, reservation.projectId, input.operationId, "settle");
    const existing = this.#operationResults.get(operationKey);
    if (existing) return existing;
    if (reservation.status !== "reserved") throw new Error("BILLING_RESERVATION_NOT_OPEN");
    if (!lte(amountMicros, reservation.remainingMicros)) throw new Error("BILLING_SETTLEMENT_EXCEEDS_RESERVATION");
    reservation.remainingMicros = sub(reservation.remainingMicros, amountMicros);
    reservation.status = reservation.remainingMicros === "0" ? "settled" : "reserved";
    const movement = this.appendMovement({
      tenantId: reservation.tenantId,
      projectId: reservation.projectId,
      attemptId: reservation.attemptId,
      reservationId: reservation.id,
      operationId: input.operationId,
      providerChargeId: null,
      kind: "settlement",
      amountMicros,
      currency: reservation.currency,
      evidenceHash: this.normalizedEvidenceHash(input.evidenceHash, { reservationId, amountMicros }),
    });
    const result: ReservationOperationResult = { reservation: this.publicReservation(reservation), movement };
    this.#operationResults.set(operationKey, result);
    return result;
  }

  release(principal: BillingPrincipal, reservationId: string, input: ReservationChangeInput) {
    return this.closeReservation(principal, reservationId, input, "release", "released");
  }

  expire(principal: BillingPrincipal, reservationId: string, input: ReservationChangeInput) {
    return this.closeReservation(principal, reservationId, input, "expiration", "expired");
  }

  recordAttemptCharge(principal: BillingPrincipal, input: AttemptChargeInput) {
    this.assertSpendAccess(principal, input.projectId);
    this.assertMicros(input.amountMicros);
    this.assertCurrency(principal.tenantId, input.projectId, input.currency, input.providerCurrency);
    const providerChargeKey = `${principal.tenantId}:${input.projectId}:${input.providerChargeId}`;
    const duplicate = this.#providerCharges.get(providerChargeKey);
    if (duplicate) return { movement: duplicate, duplicate: true };
    if (!SHA256.test(input.evidenceHash)) throw new Error("BILLING_EVIDENCE_HASH_INVALID");
    const reservation = input.reservationId ? this.requireReservation(principal, input.reservationId) : null;
    if (reservation && reservation.attemptId !== input.attemptId) throw new Error("BILLING_ATTEMPT_SCOPE_MISMATCH");
    const kind: BillingMovementKind = input.lateAfterCancellation
      ? "cancellation_late_bill_adjustment"
      : "attempt_charge";
    const movement = this.appendMovement({
      tenantId: principal.tenantId,
      projectId: input.projectId,
      attemptId: input.attemptId,
      reservationId: reservation?.id ?? null,
      operationId: `provider:${input.providerChargeId}`,
      providerChargeId: input.providerChargeId,
      kind,
      amountMicros: input.amountMicros,
      currency: input.currency,
      evidenceHash: input.evidenceHash,
    });
    this.#providerCharges.set(providerChargeKey, movement);
    return { movement, duplicate: false };
  }

  private closeReservation(
    principal: BillingPrincipal,
    reservationId: string,
    input: ReservationChangeInput,
    kind: "release" | "expiration",
    status: "released" | "expired",
  ) {
    const reservation = this.requireReservation(principal, reservationId);
    this.assertSpendAccess(principal, reservation.projectId);
    const amountMicros = input.amountMicros ?? reservation.remainingMicros;
    this.assertMicros(amountMicros);
    this.assertCurrency(reservation.tenantId, reservation.projectId, input.currency, input.providerCurrency);
    const operationKey = this.operationKey(reservation.tenantId, reservation.projectId, input.operationId, kind);
    const existing = this.#operationResults.get(operationKey);
    if (existing) return existing;
    if (reservation.status !== "reserved") throw new Error("BILLING_RESERVATION_NOT_OPEN");
    if (!lte(amountMicros, reservation.remainingMicros)) throw new Error("BILLING_RELEASE_EXCEEDS_RESERVATION");
    reservation.remainingMicros = sub(reservation.remainingMicros, amountMicros);
    reservation.status = reservation.remainingMicros === "0" ? status : "reserved";
    const movement = this.appendMovement({
      tenantId: reservation.tenantId,
      projectId: reservation.projectId,
      attemptId: reservation.attemptId,
      reservationId: reservation.id,
      operationId: input.operationId,
      providerChargeId: null,
      kind,
      amountMicros,
      currency: reservation.currency,
      evidenceHash: this.normalizedEvidenceHash(input.evidenceHash, { reservationId, amountMicros, kind }),
    });
    const result: ReservationOperationResult = { reservation: this.publicReservation(reservation), movement };
    this.#operationResults.set(operationKey, result);
    return result;
  }

  private appendMovement(input: Omit<BillingMovement, "id" | "createdAt">): BillingMovement {
    const movement: BillingMovement = {
      id: id("ledger"),
      createdAt: this.now().toISOString(),
      ...input,
    };
    this.#movements.push(movement);
    return movement;
  }

  private requireReservation(principal: BillingPrincipal, reservationId: string) {
    const reservation = this.#reservations.get(reservationId);
    if (!reservation || reservation.tenantId !== principal.tenantId) throw new Error("BILLING_RESERVATION_NOT_FOUND");
    this.assertAccess(principal, reservation.projectId);
    return reservation;
  }

  private assertAccess(principal: BillingPrincipal, projectId: string) {
    if (
      !principal.tenantId ||
      !principal.memberships.some((membership) => membership.projectId === projectId && membership.active)
    ) {
      throw new Error("PROJECT_MEMBERSHIP_MISSING");
    }
  }

  private assertSpendAccess(principal: BillingPrincipal, projectId: string) {
    this.assertAccess(principal, projectId);
    const membership = principal.memberships.find((item) => item.projectId === projectId && item.active);
    const capabilities = new Set(membership?.capabilities ?? []);
    if (membership?.role === "Viewer" || (capabilities.size > 0 && !capabilities.has("generation:spend"))) {
      throw new Error("BILLING_SPEND_NOT_AUTHORIZED");
    }
  }

  private policyFor(tenantId: string, projectId: string) {
    const key = `${tenantId}:${projectId}`;
    const existing = this.#policies.get(key);
    if (existing) return existing;
    const policy = { currency: "USD" as ProviderCurrency, budgetMicros: DEFAULT_BUDGET_MICROS };
    this.#policies.set(key, policy);
    return policy;
  }

  private assertCurrency(
    tenantId: string,
    projectId: string,
    currency: ProviderCurrency,
    providerCurrency: ProviderCurrency | undefined,
  ) {
    if (!CURRENCIES.has(currency)) throw new Error("BILLING_CURRENCY_UNSUPPORTED");
    if (providerCurrency && providerCurrency !== currency) throw new Error("BILLING_PROVIDER_CURRENCY_MISMATCH");
    const policy = this.policyFor(tenantId, projectId);
    if (currency !== policy.currency) throw new Error("BILLING_PROJECT_CURRENCY_MISMATCH");
    return policy;
  }

  private assertMicros(value: string) {
    if (!MONEY_MICROS.test(value)) throw new Error("BILLING_AMOUNT_MICROS_INVALID");
  }

  private operationKey(tenantId: string, projectId: string, operationId: string, kind: string) {
    return `${tenantId}:${projectId}:${kind}:${operationId}`;
  }

  private normalizedEvidenceHash(evidenceHash: string | undefined, fallback: unknown) {
    if (!evidenceHash) return evidenceHashFor(fallback);
    if (!SHA256.test(evidenceHash)) throw new Error("BILLING_EVIDENCE_HASH_INVALID");
    return evidenceHash;
  }

  private publicReservation(reservation: Reservation): PublicBillingReservation {
    return { ...reservation };
  }
}
