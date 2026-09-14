import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type VerifiedWebhook = Readonly<{
  providerConfigId: string;
  rawBody: Uint8Array;
  payloadHash: string;
  receiptId: string;
  timestamp: string;
}>;
export type WebhookVerificationInput = Readonly<{
  providerConfigId: string;
  rawBody: Uint8Array;
  timestamp: string | undefined;
  signature: string | undefined;
  secret: string;
  now?: Date;
  replayStore?: WebhookReplayStore;
}>;

const MAX_WEBHOOK_BYTES = 1_000_000;
const MAX_WEBHOOK_AGE_MS = 5 * 60_000;
const sha256 = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export interface WebhookReplayStore {
  /** This must be an atomic DB/Redis consume in the production adapter. */
  consume(receiptId: string, expiresAt: Date): Promise<boolean>;
}
export class InMemoryWebhookReplayStore implements WebhookReplayStore {
  #keys = new Set<string>();
  async consume(receiptId: string): Promise<boolean> {
    if (this.#keys.has(receiptId)) return false;
    this.#keys.add(receiptId);
    return true;
  }
  clear(): void {
    this.#keys.clear();
  }
}
const defaultReplayStore = new InMemoryWebhookReplayStore();

export async function verifyWebhook(input: WebhookVerificationInput): Promise<VerifiedWebhook> {
  if (!input.providerConfigId || input.rawBody.byteLength === 0 || input.rawBody.byteLength > MAX_WEBHOOK_BYTES) {
    throw new Error("WEBHOOK_RAW_BODY_INVALID");
  }
  if (!input.timestamp || !/^\d{10}$/.test(input.timestamp)) throw new Error("WEBHOOK_TIMESTAMP_REQUIRED");
  if (Math.abs((input.now ?? new Date()).getTime() - Number(input.timestamp) * 1000) > MAX_WEBHOOK_AGE_MS) {
    throw new Error("WEBHOOK_TIMESTAMP_OUTSIDE_WINDOW");
  }
  if (!input.signature?.startsWith("sha256=")) throw new Error("WEBHOOK_SIGNATURE_REQUIRED");
  const expected = createHmac("sha256", input.secret)
    .update(input.timestamp)
    .update(".")
    .update(input.rawBody)
    .digest("hex");
  const expectedBytes = Buffer.from(expected, "hex");
  const suppliedBytes = Buffer.from(input.signature.slice("sha256=".length), "hex");
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    throw new Error("WEBHOOK_SIGNATURE_INVALID");
  }
  const payloadHash = sha256(input.rawBody);
  const receiptId = `${input.providerConfigId}:${input.timestamp}:${payloadHash}`;
  if (
    !(await (input.replayStore ?? defaultReplayStore).consume(
      receiptId,
      new Date(Number(input.timestamp) * 1000 + MAX_WEBHOOK_AGE_MS),
    ))
  ) {
    throw new Error("WEBHOOK_REPLAY_DETECTED");
  }
  return {
    providerConfigId: input.providerConfigId,
    rawBody: input.rawBody,
    payloadHash,
    receiptId,
    timestamp: input.timestamp,
  };
}

export function clearWebhookReplayKeysForTest(): void {
  defaultReplayStore.clear();
}
export const webhookLimits = Object.freeze({ maxRawBytes: MAX_WEBHOOK_BYTES, timestampWindowMs: MAX_WEBHOOK_AGE_MS });
