import { describe, expect, it } from "vitest";
import { createConsumerReceiptStore, reconcileOutbox } from "./index.js";

describe("outbox reconciler", () => {
  it("republishes published events without terminal receipt", () => {
    const receipts = createConsumerReceiptStore();
    const events = [
      {
        eventId: "event-1",
        route: "image.generate",
        payloadHash: "hash-1",
        state: "published" as const,
        attemptCount: 1,
      },
    ];
    expect(reconcileOutbox(events, receipts, "worker")).toEqual([
      { eventId: "event-1", route: "image.generate", payloadHash: "hash-1" },
    ]);
    receipts.markTerminal("worker", "event-1");
    expect(reconcileOutbox(events, receipts, "worker")).toEqual([]);
  });
});
