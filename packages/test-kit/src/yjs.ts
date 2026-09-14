import * as Y from "yjs";

import { graphWith } from "./canvas.js";
import type { CanvasYDoc, TestCanvasSnapshot } from "./protocols.js";

export function createCanvasDocFixture(snapshot: TestCanvasSnapshot = graphWith()): CanvasYDoc {
  return { id: `ydoc-${snapshot.id}`, snapshot, updates: [] };
}

export function connectTestDocs(a: Y.Doc, b: Y.Doc) {
  const sync = () => {
    const updateA = Y.encodeStateAsUpdate(a);
    const updateB = Y.encodeStateAsUpdate(b);
    Y.applyUpdate(b, updateA);
    Y.applyUpdate(a, updateB);
  };
  sync();
  return {
    flush: sync,
    disconnect() {
      a.destroy();
      b.destroy();
    },
  };
}

export function flushYDocs(...docs: Y.Doc[]) {
  for (const source of docs) {
    const update = Y.encodeStateAsUpdate(source);
    for (const target of docs) {
      if (target !== source) Y.applyUpdate(target, update);
    }
  }
}
