export const packageName = "@comic-canvas/canvas-collab-yjs";

export function bootstrap() {
  return { packageName };
}

export { applyCanvasCommand } from "./commands.js";
export { createCanvasYDoc, createScopedUndoManager, readCanvasSnapshot } from "./document.js";
export { migrateCanvasYDoc } from "./migrations.js";
export { canvasOrigins } from "./origins.js";
export { applyDurableSnapshot, encodeDurableSnapshot } from "./snapshot.js";
export type { CanvasOrigin } from "./origins.js";
export type { CanvasYDoc } from "./document.js";
