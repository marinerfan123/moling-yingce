import { describe, expect, it } from "vitest";

import { DurableCanvasStore } from "../src/persistence.js";

describe("collab durable persistence", () => {
  it("appends contiguous durable revisions", () => {
    const store = new DurableCanvasStore();
    expect(
      store.append({ canvasId: "canvas_12345678", documentEpoch: 1, stateVector: "sv1", update: new Uint8Array([1]) })
        .durableSeq,
    ).toBe(1);
    expect(
      store.append({ canvasId: "canvas_12345678", documentEpoch: 1, stateVector: "sv2", update: new Uint8Array([2]) })
        .durableSeq,
    ).toBe(2);
  });
});
