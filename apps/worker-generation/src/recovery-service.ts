import type { ProviderRecoveryResult } from "./provider-contracts.js";

export type RecoveryDecision = Readonly<{
  state: "accepted" | "reconciling" | "new_attempt_allowed";
  resubmit: boolean;
}>;

export function decideRecovery(result: ProviderRecoveryResult): RecoveryDecision {
  switch (result.kind) {
    case "found":
      return { state: "accepted", resubmit: false };
    case "definitively_absent":
      if (result.evidence.source !== "authoritative_lookup" || !result.evidence.authoritative)
        throw new Error("PROVIDER_RECOVERY_ABSENCE_REQUIRES_AUTHORITATIVE_LOOKUP");
      return { state: "new_attempt_allowed", resubmit: false };
    case "unknown":
      return { state: "reconciling", resubmit: false };
    case "unsupported":
      return { state: "reconciling", resubmit: false };
    default:
      return assertNever(result);
  }
}

function assertNever(value: never): never {
  throw new Error(`RECOVERY_UNION_UNHANDLED:${String(value)}`);
}
