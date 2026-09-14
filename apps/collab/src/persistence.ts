import { createHash } from "node:crypto";

export type DurableRevision = Readonly<{
  canvasId: string;
  documentEpoch: number;
  durableSeq: number;
  updateHash: string;
  stateVector: string;
}>;

export class DurableCanvasStore {
  readonly #revisions = new Map<string, DurableRevision[]>();

  append(input: Omit<DurableRevision, "durableSeq" | "updateHash"> & { update: Uint8Array }) {
    const key = `${input.canvasId}:${input.documentEpoch}`;
    const revisions = this.#revisions.get(key) ?? [];
    const durableSeq = revisions.length + 1;
    const revision: DurableRevision = {
      canvasId: input.canvasId,
      documentEpoch: input.documentEpoch,
      durableSeq,
      updateHash: `sha256:${createHash("sha256").update(input.update).digest("hex")}`,
      stateVector: input.stateVector,
    };
    this.#revisions.set(key, [...revisions, revision]);
    return revision;
  }

  readLatest(canvasId: string, documentEpoch: number) {
    return (this.#revisions.get(`${canvasId}:${documentEpoch}`) ?? []).at(-1) ?? null;
  }
}
