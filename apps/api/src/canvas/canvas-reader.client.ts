export type DurableCanvasRevision = Readonly<{
  canvasId: string;
  documentEpoch: number;
  durableSeq: number;
  updateHash: string;
  stateVector: string;
}>;

export class CanvasDocumentReader {
  readonly #revisions = new Map<string, DurableCanvasRevision>();

  registerRevision(revision: DurableCanvasRevision) {
    this.#revisions.set(`${revision.canvasId}:${revision.documentEpoch}`, revision);
  }

  readDurableRevision(input: { canvasId: string; documentEpoch: number; serviceIdentity: "api" }) {
    const revision = this.#revisions.get(`${input.canvasId}:${input.documentEpoch}`);
    if (!revision) throw new Error("CANVAS_DURABLE_REVISION_MISSING");
    return revision;
  }
}
