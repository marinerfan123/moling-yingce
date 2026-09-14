import type { CanvasYDoc } from "./document.js";

export function migrateCanvasYDoc(canvas: CanvasYDoc) {
  if (!canvas.meta.get("schemaVersion")) canvas.meta.set("schemaVersion", 1);
  return { schemaVersion: 1 as const };
}
