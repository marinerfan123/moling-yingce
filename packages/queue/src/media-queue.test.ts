import { describe, expect, it } from "vitest";
import { createDurableMarkerStore, createMediaQueuePayload, mediaQueuePayloadKeys } from "./media-queue.js";
describe("media queue", () => {
  it("keeps queue payload opaque", () => {
    const payload = createMediaQueuePayload({
      eventId: "evt_1",
      route: "media.inspect-upload",
      payloadHash: "sha256:abc",
    });
    expect(mediaQueuePayloadKeys(payload)).toBe(true);
    expect(Object.keys(payload)).toEqual(["eventId", "route", "payloadHash"]);
  });
  it("deduplicates durable markers", () => {
    const store = createDurableMarkerStore();
    expect(store.mark("e", "s").inserted).toBe(true);
    expect(store.mark("e", "s").inserted).toBe(false);
  });
});
