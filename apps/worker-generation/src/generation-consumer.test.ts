import { describe, expect, it } from "vitest";

import { GenerationConsumer } from "./generation-consumer.js";

describe("generation consumer", () => {
  it("bootstraps scope from eventId/route/hash and writes one durable receipt", async () => {
    const payload = createGenerationQueuePayload({
      eventId: "event_generation_12345678",
      route: "generation.submit",
      payloadHash: `sha256:${"a".repeat(64)}`,
    });
    const consumer = new GenerationConsumer();
    const first = await consumer.consume(payload, { redisJobId: generationRedisJobId(payload) });
    const duplicate = await consumer.consume(payload);
    expect(duplicate).toBe(first);
    expect(first).toMatchObject({
      consumerName: "generation-worker",
      eventId: payload.eventId,
      route: "generation.submit",
      effect: "submit-bootstrapped",
    });
    expect(consumer.hasDurableMarker(payload.eventId)).toBe(true);
  });

  it("rejects injected scope or locator data in the broker payload", async () => {
    const consumer = new GenerationConsumer();
    await expect(
      consumer.consume({
        eventId: "event_generation_12345678",
        route: "generation.submit",
        payloadHash: `sha256:${"a".repeat(64)}`,
        projectId: "project_spoofed",
      } as never),
    ).rejects.toThrow("GENERATION_CONSUMER_PAYLOAD_INVALID");
  });
});

function createGenerationQueuePayload(
  input: Readonly<{ eventId: string; route: "generation.submit" | "generation.cancel"; payloadHash: string }>,
) {
  return Object.freeze(input);
}

function generationRedisJobId(payload: Readonly<{ eventId: string; route: string }>) {
  return `${payload.route}:${payload.eventId}`;
}
