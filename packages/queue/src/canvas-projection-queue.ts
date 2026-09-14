export type CanvasProjectionEvent = Readonly<{
  eventId: string;
  route: "canvas-projection";
  payloadHash: string;
  canvasId: string;
  documentEpoch: number;
  projectionSeq: number;
}>;

export type ProjectionReceipt = Readonly<{
  canvasId: string;
  documentEpoch: number;
  projectionSeq: number;
  state: "applied" | "blocked_gap" | "superseded";
}>;

export class CanvasProjectionQueue {
  readonly #lastApplied = new Map<string, number>();
  readonly #blocked = new Map<string, CanvasProjectionEvent[]>();

  route = Object.freeze({ name: "canvas-projection" });

  consume(event: CanvasProjectionEvent, activeDocumentEpoch = event.documentEpoch): ProjectionReceipt {
    const key = `${event.canvasId}:${event.documentEpoch}`;
    if (event.documentEpoch < activeDocumentEpoch) {
      return {
        canvasId: event.canvasId,
        documentEpoch: event.documentEpoch,
        projectionSeq: event.projectionSeq,
        state: "superseded",
      };
    }
    const expected = (this.#lastApplied.get(key) ?? 0) + 1;
    if (event.projectionSeq !== expected) {
      this.#blocked.set(key, [...(this.#blocked.get(key) ?? []), event]);
      return {
        canvasId: event.canvasId,
        documentEpoch: event.documentEpoch,
        projectionSeq: event.projectionSeq,
        state: "blocked_gap",
      };
    }
    this.#lastApplied.set(key, event.projectionSeq);
    this.drain(key);
    return {
      canvasId: event.canvasId,
      documentEpoch: event.documentEpoch,
      projectionSeq: event.projectionSeq,
      state: "applied",
    };
  }

  watermark(canvasId: string, documentEpoch: number) {
    return this.#lastApplied.get(`${canvasId}:${documentEpoch}`) ?? 0;
  }

  private drain(key: string) {
    let progressed = true;
    while (progressed) {
      progressed = false;
      const next = (this.#lastApplied.get(key) ?? 0) + 1;
      const blocked = this.#blocked.get(key) ?? [];
      const index = blocked.findIndex((event) => event.projectionSeq === next);
      if (index >= 0) {
        this.#lastApplied.set(key, next);
        this.#blocked.set(
          key,
          blocked.filter((_, itemIndex) => itemIndex !== index),
        );
        progressed = true;
      }
    }
  }
}
