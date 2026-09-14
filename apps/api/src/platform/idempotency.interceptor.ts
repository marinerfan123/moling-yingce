type Fingerprint = Readonly<{
  tenantId: string;
  actorId: string;
  operation: string;
  key: string;
  body?: unknown;
}>;

const memory = new Map<string, { bodyHash: string; response: unknown }>();

export class IdempotencyInterceptor {
  async run<T>(
    fingerprint: Fingerprint,
    handler: () => Promise<T>,
  ): Promise<T | { status: 409; error: "IDEMPOTENCY_PAYLOAD_MISMATCH" }> {
    const key = `${fingerprint.tenantId}:${fingerprint.actorId}:${fingerprint.operation}:${fingerprint.key}`;
    const bodyHash = JSON.stringify(sortObject(fingerprint.body ?? null));
    const existing = memory.get(key);
    if (existing) {
      if (existing.bodyHash !== bodyHash) return { status: 409, error: "IDEMPOTENCY_PAYLOAD_MISMATCH" };
      return existing.response as T;
    }
    const response = await handler();
    memory.set(key, { bodyHash, response });
    return response;
  }
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortObject(item)]),
    );
  }
  return value;
}
