import { describe, expect, it } from "vitest";
import { IdempotencyInterceptor } from "./idempotency.interceptor.js";

describe("idempotency interceptor", () => {
  it("deduplicates equivalent requests and rejects semantic mismatch", async () => {
    const interceptor = new IdempotencyInterceptor();
    let mutations = 0;
    const fp = { tenantId: "t", actorId: "a", operation: "op", key: "k", body: { b: 2, a: 1 } };
    const first = await interceptor.run(fp, async () => {
      mutations += 1;
      return { ok: true };
    });
    const second = await interceptor.run({ ...fp, body: { a: 1, b: 2 } }, async () => {
      mutations += 1;
      return { ok: false };
    });
    const mismatch = await interceptor.run({ ...fp, body: { a: 2 } }, async () => ({ ok: false }));
    expect(second).toEqual(first);
    expect(mutations).toBe(1);
    expect(mismatch).toEqual({ status: 409, error: "IDEMPOTENCY_PAYLOAD_MISMATCH" });
  });
});
