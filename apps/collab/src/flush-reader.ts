import type { DurableCanvasStore } from "./persistence.js";

export class FlushReader {
  constructor(private readonly store: DurableCanvasStore) {}

  readDurableRevision(input: { canvasId: string; documentEpoch: number; serviceIdentity: string }) {
    if (input.serviceIdentity !== "api") throw new Error("FLUSH_READ_SERVICE_IDENTITY_INVALID");
    const revision = this.store.readLatest(input.canvasId, input.documentEpoch);
    if (!revision) throw new Error("CANVAS_DURABLE_REVISION_MISSING");
    return revision;
  }
}
