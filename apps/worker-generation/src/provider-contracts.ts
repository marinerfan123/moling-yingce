import type { AuthoritativeAbsenceEvidence } from "./attempt-service.js";

export type ProviderRecoveryResult =
  | { readonly kind: "found"; readonly submission: { externalId: string } }
  | { readonly kind: "definitively_absent"; readonly evidence: AuthoritativeAbsenceEvidence }
  | { readonly kind: "unknown"; readonly reasonCode: string }
  | { readonly kind: "unsupported" };
export type ProviderCancellationResult =
  | { readonly kind: "accepted" }
  | {
      readonly kind: "already_terminal";
      readonly status: { normalizedStatus: "queued" | "running" | "succeeded" | "failed" | "canceled" };
    }
  | { readonly kind: "unknown"; readonly reasonCode: string }
  | { readonly kind: "unsupported" };
export interface ProviderSubmitTransportCheckpoint {
  /** Await immediately before invoking the provider transport. */
  beforeInvoke(): Promise<void>;
  /** Await from the transport's first-request-byte callback, never speculatively. */
  bytesStarted(): Promise<void>;
}
export interface ModelProviderAdapter {
  readonly providerKey: string;
  readonly recoveryMode: "idempotency-key" | "client-reference-query" | "unsupported";
  validate(input: object): { ok: boolean };
  submit(input: object, transport: ProviderSubmitTransportCheckpoint): Promise<{ externalId: string }>;
  recover(submissionKey: string): Promise<ProviderRecoveryResult>;
  cancel(externalId: string): Promise<ProviderCancellationResult>;
  parseWebhook(input: object): Promise<{ externalId: string; eventId: string }>;
  normalizeError(error: unknown): { code: string; retryable: boolean };
}
export type ProviderEventQueuePayload = Readonly<{
  eventId: string;
  route: "provider.event" | "provider.output.ingest";
  payloadHash: string;
}>;
export function createProviderEventQueuePayload(payload: ProviderEventQueuePayload): ProviderEventQueuePayload {
  if (
    !payload.eventId ||
    !["provider.event", "provider.output.ingest"].includes(payload.route) ||
    !/^sha256:[a-f0-9]{64}$/.test(payload.payloadHash)
  )
    throw new Error("PROVIDER_EVENT_QUEUE_PAYLOAD_INVALID");
  if (!providerEventQueuePayloadKeys(payload)) throw new Error("PROVIDER_EVENT_QUEUE_EXTRA_KEYS");
  if (/(?:https?:\/\/|secret|api[_-]?key)/i.test(JSON.stringify(payload)))
    throw new Error("PROVIDER_EVENT_QUEUE_LOCATOR_FORBIDDEN");
  return Object.freeze({ ...payload });
}
export function providerEventQueuePayloadKeys(value: unknown): value is ProviderEventQueuePayload {
  return (
    !!value &&
    typeof value === "object" &&
    Object.keys(value).length === 3 &&
    Object.keys(value).every((key) => ["eventId", "route", "payloadHash"].includes(key))
  );
}
