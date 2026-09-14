import { once, type ProcessorContext } from "./shared.js";

/** Narrow Media port, contract-tested against @comic-canvas/storage at its package boundary. */
export type RuntimeSafeFetchRequest = Readonly<{
  url: string;
  maxBytes: number;
  timeoutMs: number;
  quarantineKey: string;
  caller?: "media-worker";
}>;
export type SafeFetchQuarantineReceipt = Readonly<{ quarantineKey: string; bytes: number; sha256: string }>;
export type SafeFetchOperationContext = Readonly<{ signal: AbortSignal; deadlineAt: number }>;
export type SafeFetchQuarantineSink = Readonly<{
  readonly capability?: "conditional-quarantine-v1";
  open(expectedQuarantineKey: string, context: SafeFetchOperationContext): Promise<void>;
  write(expectedQuarantineKey: string, chunk: Uint8Array, context: SafeFetchOperationContext): Promise<void>;
  complete(
    expectedQuarantineKey: string,
    accepted: {
      url: string;
      pinnedIp: string;
      tlsServerName: string;
      bytes: number;
      sha256: string;
    },
    context: SafeFetchOperationContext,
  ): Promise<SafeFetchQuarantineReceipt>;
  abort(expectedQuarantineKey: string, reason: string, context: SafeFetchOperationContext): Promise<void>;
}>;
export type SafeFetchProxy = Readonly<{
  fetch(
    request: RuntimeSafeFetchRequest,
    sink: SafeFetchQuarantineSink,
  ): Promise<
    Readonly<
      | {
          allow: true;
          pinnedIp: string;
          finalUrl: string;
          tlsServerName: string;
          bytes: number;
          sha256: string;
          receipt: SafeFetchQuarantineReceipt;
        }
      | { allow: false; reason: string }
    >
  >;
}>;
export type ProviderOutputFetchRequest = Omit<RuntimeSafeFetchRequest, "caller" | "quarantineKey">;
export type ProviderOutputIngestResult = Readonly<
  | { status: "quarantined"; instructionId: string; bytes: number; sha256: string }
  | { status: "refresh_required"; instructionId: string }
  | { status: "recoverable_failure"; instructionId: string; reason: string }
>;
export type ProviderOutputIngestClaim = Readonly<
  | { state: "claimed"; quarantineKey: string; claimToken: string }
  | { state: "in_progress" }
  | { state: "completed"; result: ProviderOutputIngestResult }
>;

export interface ProviderOutputIngestReceiptStore {
  readonly kind: "durable" | "test";
  claim(instructionId: string): Promise<ProviderOutputIngestClaim>;
  complete(instructionId: string, claimToken: string, result: ProviderOutputIngestResult): Promise<void>;
  fail(instructionId: string, claimToken: string): Promise<void>;
}

/** Explicit test adapter. Production composition requires kind: "durable". */
export class InMemoryProviderOutputIngestReceiptStore implements ProviderOutputIngestReceiptStore {
  readonly kind = "test" as const;
  #receipts = new Map<string, ProviderOutputIngestResult | Readonly<{ quarantineKey: string; claimToken: string }>>();
  #tokenSequence = 0;

  async claim(instructionId: string): Promise<ProviderOutputIngestClaim> {
    const existing = this.#receipts.get(instructionId);
    if (existing && "claimToken" in existing) return { state: "in_progress" };
    if (existing) return { state: "completed", result: existing };
    const claim = {
      quarantineKey: providerOutputQuarantineKey(instructionId),
      claimToken: `test-claim-${++this.#tokenSequence}`,
    };
    this.#receipts.set(instructionId, claim);
    return { state: "claimed", ...claim };
  }

  async complete(instructionId: string, claimToken: string, result: ProviderOutputIngestResult): Promise<void> {
    const existing = this.#receipts.get(instructionId);
    if (!existing || !("claimToken" in existing) || existing.claimToken !== claimToken)
      throw new Error("PROVIDER_OUTPUT_INGEST_CLAIM_FENCED");
    this.#receipts.set(instructionId, result);
  }

  async fail(instructionId: string, claimToken: string): Promise<void> {
    const existing = this.#receipts.get(instructionId);
    if (!existing || !("claimToken" in existing) || existing.claimToken !== claimToken)
      throw new Error("PROVIDER_OUTPUT_INGEST_CLAIM_FENCED");
    this.#receipts.delete(instructionId);
  }
}

export function providerOutputQuarantineKey(instructionId: string): string {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(instructionId)) throw new Error("PROVIDER_OUTPUT_INGEST_ID_INVALID");
  return `quarantine/provider-output/${instructionId}`;
}

export async function ingestProviderOutput(
  input: Readonly<{ instructionId: string; expiresAt: string; fetch: ProviderOutputFetchRequest }>,
  ctx: ProcessorContext,
  sink: SafeFetchQuarantineSink,
  safeFetch: SafeFetchProxy,
  receipts: ProviderOutputIngestReceiptStore,
): Promise<ProviderOutputIngestResult> {
  const claim = await receipts.claim(input.instructionId);
  if (claim.state === "completed") return claim.result;
  if (claim.state === "in_progress")
    return {
      status: "recoverable_failure",
      instructionId: input.instructionId,
      reason: "PROVIDER_OUTPUT_INGEST_IN_PROGRESS",
    };
  if (new Date(input.expiresAt).getTime() <= Date.now()) {
    const result: ProviderOutputIngestResult = { status: "refresh_required", instructionId: input.instructionId };
    await receipts.complete(input.instructionId, claim.claimToken, result);
    return result;
  }
  const cached = once(ctx, "ingest-provider-output", () => input.instructionId);
  if (cached !== input.instructionId) throw new Error("PROVIDER_OUTPUT_INGEST_MARKER_CONFLICT");
  try {
    const result = await safeFetch.fetch(
      { ...input.fetch, quarantineKey: claim.quarantineKey, caller: "media-worker" },
      sink,
    );
    if (!result.allow) {
      await receipts.fail(input.instructionId, claim.claimToken);
      return { status: "recoverable_failure", instructionId: input.instructionId, reason: result.reason };
    }
    if (
      result.receipt.quarantineKey !== claim.quarantineKey ||
      result.receipt.bytes !== result.bytes ||
      result.receipt.sha256 !== result.sha256
    ) {
      await receipts.fail(input.instructionId, claim.claimToken);
      return {
        status: "recoverable_failure",
        instructionId: input.instructionId,
        reason: "SAFE_FETCH_QUARANTINE_RECEIPT_INVALID",
      };
    }
    const completed: ProviderOutputIngestResult = {
      status: "quarantined",
      instructionId: input.instructionId,
      bytes: result.receipt.bytes,
      sha256: result.receipt.sha256,
    };
    await receipts.complete(input.instructionId, claim.claimToken, completed);
    return completed;
  } catch {
    await receipts.fail(input.instructionId, claim.claimToken).catch(() => undefined);
    return {
      status: "recoverable_failure",
      instructionId: input.instructionId,
      reason: "SAFE_FETCH_TRANSPORT_REJECTED",
    };
  }
}
