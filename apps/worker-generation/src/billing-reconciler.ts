export type GenerationWorkBinding = Readonly<{
  eventId: string;
  payloadHash: string;
}>;

export type AttemptCharge = Readonly<{
  generationAttemptId: string;
  workBinding: GenerationWorkBinding;
  providerChargeId: string;
  amountMicros: string;
  currency: "USD" | "CNY" | "EUR" | "JPY" | "KRW";
  evidenceHash: string;
  canceled: boolean;
}>;
export interface AttemptChargeLedger {
  recordAttemptCharge(
    input: Omit<AttemptCharge, "canceled"> & Readonly<{ lateAfterCancellation: boolean }>,
  ): Promise<Readonly<{ duplicate: boolean }>>;
}

export class BillingReconciler {
  #receipts = new Map<string, Promise<Readonly<{ duplicate: boolean }>>>();
  constructor(private readonly ledger: AttemptChargeLedger) {}

  async reconcile(
    input: AttemptCharge,
  ): Promise<Readonly<{ duplicate: boolean; unselectedCandidate: boolean; adjustment: boolean }>> {
    if (!/^(0|[1-9][0-9]*)$/.test(input.amountMicros)) throw new Error("BILLING_AMOUNT_MICROS_INVALID");
    if (!input.workBinding.eventId || !input.workBinding.payloadHash) throw new Error("BILLING_WORK_BINDING_INVALID");
    const key = `${input.generationAttemptId}:${input.providerChargeId}`;
    const existing = this.#receipts.get(key);
    if (existing) {
      await existing;
      return { duplicate: true, unselectedCandidate: input.canceled, adjustment: input.canceled };
    }
    const { canceled, ...charge } = input;
    const receipt = this.ledger.recordAttemptCharge({ ...charge, lateAfterCancellation: canceled });
    this.#receipts.set(key, receipt);
    try {
      const settled = await receipt;
      return { duplicate: settled.duplicate, unselectedCandidate: input.canceled, adjustment: input.canceled };
    } catch (error) {
      this.#receipts.delete(key);
      throw error;
    }
  }
}
