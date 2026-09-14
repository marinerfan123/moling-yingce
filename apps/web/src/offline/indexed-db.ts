export type OfflineStoreName = "canvasDocs" | "composerDrafts" | "generationIntents" | "recoveryMetadata";

export type OfflineRecord = Readonly<{
  id: string;
  tenantId: string;
  projectId: string;
  updatedAt: string;
  value: unknown;
}>;

export class OfflineDatabase {
  readonly #stores = new Map<OfflineStoreName, Map<string, OfflineRecord>>();

  constructor() {
    for (const name of ["canvasDocs", "composerDrafts", "generationIntents", "recoveryMetadata"] as const) {
      this.#stores.set(name, new Map());
    }
  }

  put(store: OfflineStoreName, record: OfflineRecord) {
    this.#stores.get(store)?.set(record.id, structuredClone(record));
  }

  get(store: OfflineStoreName, id: string) {
    const record = this.#stores.get(store)?.get(id);
    return record ? structuredClone(record) : null;
  }

  list(store: OfflineStoreName) {
    return [...(this.#stores.get(store)?.values() ?? [])].map((record) => structuredClone(record));
  }

  transaction(mutator: (tx: OfflineDatabase) => void) {
    const snapshot = this.cloneStores();
    try {
      mutator(this);
    } catch (error) {
      this.#stores.clear();
      for (const [name, store] of snapshot) this.#stores.set(name, store);
      throw error;
    }
  }

  counts() {
    return Object.fromEntries([...this.#stores.entries()].map(([name, store]) => [name, store.size])) as Record<
      OfflineStoreName,
      number
    >;
  }

  private cloneStores() {
    return new Map(
      [...this.#stores.entries()].map(([name, store]) => [
        name,
        new Map([...store.entries()].map(([id, value]) => [id, structuredClone(value)])),
      ]),
    );
  }
}
