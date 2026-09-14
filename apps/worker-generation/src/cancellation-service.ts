import { createHash } from "node:crypto";

import type { AttemptRepository, CancellationReceiptRecord } from "./attempt-service.js";
import type { ProviderCancellationResult } from "./provider-contracts.js";

export type CancellationReceipt = CancellationReceiptRecord;

export class CancellationService {
  constructor(private readonly attempts: AttemptRepository) {}

  async apply(
    operationKey: string,
    attemptId: string,
    result: ProviderCancellationResult,
  ): Promise<CancellationReceipt> {
    const begin = await this.attempts.beginCancellation(operationKey, attemptId);
    if (begin.disposition === "existing") return begin.receipt;
    const started = await this.attempts.markCancellationInvokeStarted(operationKey, attemptId);
    if (started.disposition === "existing") return started.receipt;
    return this.applyClaimed(operationKey, attemptId, result);
  }

  async execute(
    operationKey: string,
    attemptId: string,
    invoke: () => Promise<ProviderCancellationResult>,
  ): Promise<CancellationReceipt> {
    const begin = await this.attempts.beginCancellation(operationKey, attemptId);
    if (begin.disposition === "existing") return begin.receipt;
    const started = await this.attempts.markCancellationInvokeStarted(operationKey, attemptId);
    if (started.disposition === "existing") return started.receipt;
    let result: ProviderCancellationResult;
    try {
      result = await invoke();
    } catch {
      result = { kind: "unknown", reasonCode: "PROVIDER_CANCEL_TRANSPORT_AMBIGUOUS" };
    }
    return this.applyClaimed(operationKey, attemptId, result);
  }

  private applyClaimed(
    operationKey: string,
    attemptId: string,
    result: ProviderCancellationResult,
  ): Promise<CancellationReceipt> | CancellationReceipt {
    const evidenceHash = hashEvidence({ operationKey, attemptId, result });
    switch (result.kind) {
      case "accepted":
        return this.attempts.completeCancellation({
          operationKey,
          attemptId,
          cancellationState: "acknowledged",
          evidenceHash,
        });
      case "already_terminal":
        assertTerminalStatus(result.status.normalizedStatus);
        return this.attempts.completeCancellation({
          operationKey,
          attemptId,
          cancellationState: "acknowledged",
          terminalStatus: result.status.normalizedStatus,
          evidenceHash,
        });
      case "unknown":
        return this.attempts.completeCancellation({
          operationKey,
          attemptId,
          cancellationState: "unknown",
          evidenceHash,
        });
      case "unsupported":
        return this.attempts.completeCancellation({
          operationKey,
          attemptId,
          cancellationState: "unsupported",
          evidenceHash,
        });
      default:
        return assertNever(result);
    }
  }
}

function hashEvidence(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function assertTerminalStatus(
  status: "queued" | "running" | "succeeded" | "failed" | "canceled",
): asserts status is "succeeded" | "failed" | "canceled" {
  if (status === "queued" || status === "running") throw new Error("CANCEL_ALREADY_TERMINAL_STATUS_INVALID");
}

function assertNever(value: never): never {
  throw new Error(`CANCELLATION_UNION_UNHANDLED:${String(value)}`);
}
