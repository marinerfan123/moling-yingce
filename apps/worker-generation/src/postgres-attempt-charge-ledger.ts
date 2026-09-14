import type { AttemptChargeLedger } from "./billing-reconciler.js";

export type AttemptChargeQueryPort = Readonly<{
  query(sql: string, params: readonly unknown[]): Promise<readonly Readonly<{ ledger_movement_id: string }>[]>;
}>;

export class PostgresAttemptChargeLedger implements AttemptChargeLedger {
  constructor(private readonly db: AttemptChargeQueryPort) {}

  async recordAttemptCharge(input: Parameters<AttemptChargeLedger["recordAttemptCharge"]>[0]) {
    const rows = await this.db.query(
      "select app.record_attempt_charge($1,$2,$3,$4,$5,$6,$7,$8) as ledger_movement_id",
      [
        input.generationAttemptId,
        input.workBinding.eventId,
        input.workBinding.payloadHash,
        input.providerChargeId,
        input.amountMicros,
        input.currency,
        input.evidenceHash,
        input.lateAfterCancellation,
      ],
    );
    if (!rows[0]?.ledger_movement_id) throw new Error("BILLING_CHARGE_RESULT_MISSING");
    return { duplicate: false };
  }
}
