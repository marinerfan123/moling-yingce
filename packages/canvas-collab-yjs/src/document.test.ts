import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import {
  applyCanvasCommand,
  applyDurableSnapshot,
  canvasOrigins,
  createCanvasYDoc,
  createScopedUndoManager,
  encodeDurableSnapshot,
  migrateCanvasYDoc,
  readCanvasSnapshot,
} from "./index.js";

const node = (id: string, x = 0, y = 0) => ({
  id,
  kind: "note",
  position: { x, y },
  data: { label: id },
});

function sync(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
}

describe("canvas ydoc document", () => {
  it("applies commands and keeps viewport/progress out of the durable document", () => {
    const canvas = createCanvasYDoc();
    applyCanvasCommand(
      canvas,
      { type: "node.add", operationId: "op_12345678", node: node("node_12345678") },
      canvasOrigins.localA,
    );
    applyCanvasCommand(
      canvas,
      {
        type: "node.configure",
        operationId: "op_22345678",
        nodeId: "node_12345678",
        patch: { labelOverride: "只允许展示名" },
      },
      canvasOrigins.localA,
    );
    const snapshot = readCanvasSnapshot(canvas);
    expect(snapshot.nodes[0]?.data).toMatchObject({ labelOverride: "只允许展示名" });
    expect(canvas.meta.get("viewport")).toBeUndefined();
    expect(migrateCanvasYDoc(canvas)).toEqual({ schemaVersion: 1 });
  });

  it("converges two documents after concurrent add/move/delete operations", () => {
    const a = createCanvasYDoc();
    const b = createCanvasYDoc();
    applyCanvasCommand(
      a,
      { type: "node.add", operationId: "op_12345678", node: node("node_12345678", 1, 1) },
      canvasOrigins.localA,
    );
    applyCanvasCommand(
      b,
      { type: "node.add", operationId: "op_22345678", node: node("node_22345678", 2, 2) },
      canvasOrigins.localB,
    );
    sync(a.doc, b.doc);
    applyCanvasCommand(
      a,
      { type: "node.move", operationId: "op_32345678", positions: { node_12345678: { x: 5, y: 5 } } },
      canvasOrigins.localA,
    );
    applyCanvasCommand(
      b,
      { type: "node.remove", operationId: "op_42345678", nodeIds: ["node_22345678"] },
      canvasOrigins.localB,
    );
    sync(a.doc, b.doc);
    expect(readCanvasSnapshot(a)).toEqual(readCanvasSnapshot(b));
    expect(readCanvasSnapshot(a).nodes.map((item) => item.id)).toEqual(["node_12345678"]);
  });

  it("dedupes projection.upsert by operationId inside the same Yjs transaction", () => {
    const canvas = createCanvasYDoc();
    for (let i = 0; i < 100; i += 1) {
      applyCanvasCommand(
        canvas,
        { type: "projection.upsert", operationId: "op_12345678", node: node("node_projection1", i, i) },
        canvasOrigins.projection,
      );
    }
    expect(readCanvasSnapshot(canvas).nodes).toHaveLength(1);
    expect(readCanvasSnapshot(canvas).nodes[0]?.position).toEqual({ x: 0, y: 0 });
  });

  it("undoes only tracked local origin and preserves remote edits", () => {
    const canvas = createCanvasYDoc();
    const undo = createScopedUndoManager(canvas, canvasOrigins.localA);
    applyCanvasCommand(
      canvas,
      { type: "node.add", operationId: "op_12345678", node: node("node_local001") },
      canvasOrigins.localA,
    );
    applyCanvasCommand(
      canvas,
      { type: "node.add", operationId: "op_22345678", node: node("node_remote01") },
      canvasOrigins.remote,
    );
    undo.undo();
    expect(readCanvasSnapshot(canvas).nodes.map((item) => item.id)).toEqual(["node_remote01"]);
  });

  it("encodes and restores durable snapshots", () => {
    const canvas = createCanvasYDoc();
    applyCanvasCommand(
      canvas,
      { type: "node.add", operationId: "op_12345678", node: node("node_12345678") },
      canvasOrigins.localA,
    );
    const encoded = encodeDurableSnapshot(canvas);
    const restored = applyDurableSnapshot(encoded.update);
    expect(readCanvasSnapshot(restored)).toEqual(readCanvasSnapshot(canvas));
  });
});
