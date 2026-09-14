import { describe, expect, it } from "vitest";

import { CanvasProjectionQueue } from "./canvas-projection-queue.js";
import { queueRoutes, registerQueueRoute } from "./index.js";

describe("canvas projection queue", () => {
  it("blocks N+1 until N arrives and then advances the watermark", () => {
    const queue = new CanvasProjectionQueue();
    const base = {
      eventId: "event_12345678",
      route: "canvas-projection" as const,
      payloadHash: "sha256:x",
      canvasId: "canvas_12345678",
      documentEpoch: 1,
    };
    expect(queue.consume({ ...base, projectionSeq: 2 }).state).toBe("blocked_gap");
    expect(queue.watermark("canvas_12345678", 1)).toBe(0);
    expect(queue.consume({ ...base, eventId: "event_22345678", projectionSeq: 1 }).state).toBe("applied");
    expect(queue.watermark("canvas_12345678", 1)).toBe(2);
  });

  it("marks old document epochs as superseded and registers a dedicated route", () => {
    const queue = new CanvasProjectionQueue();
    registerQueueRoute(queue.route);
    expect(
      queue.consume(
        {
          eventId: "event_12345678",
          route: "canvas-projection",
          payloadHash: "sha256:x",
          canvasId: "canvas_12345678",
          documentEpoch: 1,
          projectionSeq: 1,
        },
        2,
      ).state,
    ).toBe("superseded");
    expect(queueRoutes().map((route) => route.name)).toContain("canvas-projection");
  });
});
