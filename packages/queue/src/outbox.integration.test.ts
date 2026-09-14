import { describe, expect, it } from "vitest";
import { createConsumerReceiptStore, createOutboxDispatcher } from "./index.js";

describe("outbox dispatcher", () => {
  it("claims once and emits opaque BullMQ payload only", () => {
    const dispatcherA = createOutboxDispatcher("a");
    const event = {
      eventId: "event-1",
      route: "image.generate",
      payloadHash: "hash-1",
      state: "pending" as const,
      attemptCount: 0,
    };
    const [claimed] = dispatcherA.claim([event]);
    expect(claimed?.leaseOwner).toBe("a");
    expect(dispatcherA.toPayload(claimed!)).toEqual({
      eventId: "event-1",
      route: "image.generate",
      payloadHash: "hash-1",
    });
    expect(dispatcherA.toPayload(claimed!)).not.toHaveProperty("tenantId");
  });

  it("consumer receipt is permanent and idempotent", () => {
    const store = createConsumerReceiptStore();
    expect(store.markTerminal("worker", "event-1")).toEqual({ inserted: true });
    expect(store.markTerminal("worker", "event-1")).toEqual({ inserted: false });
  });
});
