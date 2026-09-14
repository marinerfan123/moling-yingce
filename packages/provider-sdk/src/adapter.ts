import type { ModelProviderAdapter, ProviderCancellationResult, ProviderRecoveryResult } from "./types.js";

export function canResubmitAfterRecovery(result: ProviderRecoveryResult): boolean {
  return result.kind === "definitively_absent" && result.evidence.authoritative === true;
}

export function assertLegalRecovery(result: ProviderRecoveryResult): ProviderRecoveryResult {
  if (result.kind === "definitively_absent") {
    if (result.evidence.source !== "authoritative_lookup" || result.evidence.authoritative !== true) {
      throw new Error("PROVIDER_RECOVERY_ABSENCE_REQUIRES_AUTHORITATIVE_LOOKUP");
    }
  }
  return result;
}

export function isCancellationTerminal(result: ProviderCancellationResult): boolean {
  return result.kind === "already_terminal";
}

export function assertAdapterShape(adapter: ModelProviderAdapter): ModelProviderAdapter {
  if (adapter.capabilities.length === 0) throw new Error("PROVIDER_CAPABILITIES_EMPTY");
  return adapter;
}

export function normalizeTransportFailure(error: unknown) {
  return {
    kind: "unknown" as const,
    reasonCode: "PROVIDER_TRANSPORT_AMBIGUOUS",
    evidence: {
      source: "system" as const,
      observedAt: new Date(0).toISOString(),
      reference: error instanceof Error ? error.name : "transport-error",
      lookupMode: "idempotency-key" as const,
      authoritative: false,
    },
  };
}
