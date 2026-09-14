import * as Y from "yjs";

import { createCanvasYDoc, readCanvasSnapshot } from "./document.js";

export function encodeDurableSnapshot(canvas: ReturnType<typeof createCanvasYDoc>) {
  const update = Y.encodeStateAsUpdate(canvas.doc);
  return {
    schemaVersion: 1 as const,
    update,
    byteLength: update.byteLength,
    snapshot: readCanvasSnapshot(canvas),
  };
}

export function applyDurableSnapshot(update: Uint8Array) {
  const canvas = createCanvasYDoc();
  Y.applyUpdate(canvas.doc, update);
  return canvas;
}
