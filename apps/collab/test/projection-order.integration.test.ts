import { describe, expect, it } from "vitest";

import { ProjectionConsumer } from "../src/projection-consumer.js";

describe("projection ordering", () => {
  it("blocks gaps and applies in sequence", () => {
    const consumer = new ProjectionConsumer();
    const base = {
      eventId: "event_12345678",
      route: "canvas-projection" as const,
      payloadHash: "sha256:x",
      canvasId: "canvas_12345678",
      documentEpoch: 1,
    };
    expect(consumer.consume({ ...base, projectionSeq: 2 }).state).toBe("blocked_gap");
    expect(consumer.consume({ ...base, eventId: "event_22345678", projectionSeq: 1 }).state).toBe("applied");
    expect(consumer.watermark("canvas_12345678", 1)).toBe(2);
  });
});
