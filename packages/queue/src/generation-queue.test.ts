import { describe, expect, it } from "vitest";

import { createGenerationQueuePayload, generationQueuePayloadKeys, generationRedisJobId } from "./generation-queue.js";

describe("generation queue", () => {
  it("keeps the durable payload to eventId, route and payloadHash only", () => {
    const payload = createGenerationQueuePayload({
      eventId: "event_generation_0001",
      route: "generation.submit",
      payloadHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    expect(Object.keys(payload)).toEqual(["eventId", "route", "payloadHash"]);
    expect(generationQueuePayloadKeys(payload)).toBe(true);
  });

  it("rejects locators and extra driver data in queue payloads", () => {
    expect(() =>
      createGenerationQueuePayload({
        eventId: "event_generation_0002",
        route: "generation.submit",
        payloadHash: "https://storage.example.com/private-object",
      }),
    ).toThrow("GENERATION_QUEUE_LOCATOR_FORBIDDEN");
    expect(
      generationQueuePayloadKeys({ eventId: "event_1", route: "generation.submit", payloadHash: "x", jobId: "1" }),
    ).toBe(false);
  });

  it("treats Redis jobId as a repeatable optimization derived from the durable payload", () => {
    const payload = createGenerationQueuePayload({
      eventId: "event_generation_0003",
      route: "generation.cancel",
      payloadHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });

    expect(generationRedisJobId(payload)).toBe("generation.cancel:event_generation_0003");
  });
});
