export type ProjectionEvent = Readonly<{
  canvasId: string;
  documentEpoch: number;
  projectionSeq: number;
}>;

export class ProjectionConsumer {
  readonly #lastApplied = new Map<string, number>();
  readonly #blocked = new Map<string, ProjectionEvent[]>();

  consume(event: ProjectionEvent) {
    const key = `${event.canvasId}:${event.documentEpoch}`;
    const expected = (this.#lastApplied.get(key) ?? 0) + 1;
    if (event.projectionSeq !== expected) {
      this.#blocked.set(key, [...(this.#blocked.get(key) ?? []), event]);
      return { state: "blocked_gap" as const };
    }
    this.#lastApplied.set(key, event.projectionSeq);
    this.drain(key);
    return { state: "applied" as const };
  }

  watermark(canvasId: string, documentEpoch: number) {
    return this.#lastApplied.get(`${canvasId}:${documentEpoch}`) ?? 0;
  }

  private drain(key: string) {
    const blocked = this.#blocked.get(key) ?? [];
    const next = (this.#lastApplied.get(key) ?? 0) + 1;
    if (blocked.some((event) => event.projectionSeq === next)) this.#lastApplied.set(key, next);
  }
}
