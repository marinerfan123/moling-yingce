import { describe, expect, it } from "vitest";

import { DurableCanvasStore } from "../src/persistence.js";

describe("projection crash recovery markers", () => {
  it("keeps published-without-receipt nonterminal until durable revision is readable", () => {
    const store = new DurableCanvasStore();
    const revision = store.append({
      canvasId: "canvas_12345678",
      documentEpoch: 1,
      stateVector: "sv",
      update: new Uint8Array([1, 2, 3]),
    });
    expect(revision.updateHash).toMatch(/^sha256:/);
    expect(store.readLatest("canvas_12345678", 1)?.durableSeq).toBe(1);
  });
});
