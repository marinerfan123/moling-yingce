import type { DurableCanvasStore } from "./persistence.js";

export function loadActiveRevision(store: DurableCanvasStore, canvasId: string, documentEpoch: number) {
  const revision = store.readLatest(canvasId, documentEpoch);
  if (!revision) throw new Error("ACTIVE_CANVAS_REVISION_MISSING");
  return revision;
}
