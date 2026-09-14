import { createHash } from "node:crypto";
import { currentCommandTransaction, runCommandTransaction } from "./command-transaction.js";

export type RequestFingerprint = Readonly<{
  tenantId: string;
  actorId: string;
  operation: string;
  key: string;
  method: string;
  pathParams?: Record<string, unknown>;
  semanticQuery?: Record<string, unknown>;
  body?: unknown;
}>;

export type IdempotentResponse = Readonly<{
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}>;

const store = new Map<string, { fingerprintHash: string; response: IdempotentResponse }>();

export function canonicalizeRequestFingerprint(input: RequestFingerprint) {
  return stableJson({
    operation: input.operation,
    method: input.method.toUpperCase(),
    pathParams: input.pathParams ?? {},
    semanticQuery: input.semanticQuery ?? {},
    body: input.body ?? null,
  });
}

export async function runIdempotentCommand(
  context: { traceId: string },
  requestFingerprint: RequestFingerprint,
  handler: () => Promise<IdempotentResponse>,
): Promise<IdempotentResponse> {
  const key = `${requestFingerprint.tenantId}:${requestFingerprint.actorId}:${requestFingerprint.operation}:${requestFingerprint.key}`;
  const fingerprintHash = createHash("sha256").update(canonicalizeRequestFingerprint(requestFingerprint)).digest("hex");
  const existing = store.get(key);
  if (existing) {
    if (existing.fingerprintHash !== fingerprintHash) {
      return {
        status: 409,
        body: {
          error: { code: "IDEMPOTENCY_PAYLOAD_MISMATCH", message: "Idempotency key reused with different payload" },
          traceId: context.traceId,
        },
      };
    }
    return existing.response;
  }

  return runCommandTransaction(
    { traceId: context.traceId, tenantId: requestFingerprint.tenantId, actorId: requestFingerprint.actorId },
    async () => {
      const response = await handler();
      currentCommandTransaction()?.effects.push("idempotency.response.persisted");
      store.set(key, { fingerprintHash, response });
      return response;
    },
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
