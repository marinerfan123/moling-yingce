import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import { applyCanvasCommand, canvasOrigins, createCanvasYDoc, readCanvasSnapshot } from "./index.js";

const commandFor = (i: number) =>
  ({
    type: "node.add" as const,
    operationId: `op_prop${String(i).padStart(8, "0")}`,
    node: { id: `node_prop${String(i).padStart(8, "0")}`, kind: "note", position: { x: i, y: i }, data: { i } },
  }) as const;

describe("canvas ydoc convergence property", () => {
  it("converges randomized interleavings deterministically", () => {
    for (let run = 0; run < 100; run += 1) {
      const a = createCanvasYDoc();
      const b = createCanvasYDoc();
      for (let i = 0; i < 10; i += 1) {
        const target = (run + i) % 2 === 0 ? a : b;
        applyCanvasCommand(
          target,
          commandFor(run * 10 + i),
          target === a ? canvasOrigins.localA : canvasOrigins.localB,
        );
      }
      Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
      Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
      expect(readCanvasSnapshot(a)).toEqual(readCanvasSnapshot(b));
    }
  });
});
