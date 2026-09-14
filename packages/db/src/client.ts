export type RuntimeRole = "api" | "collab" | "dispatcher" | "generation-worker" | "media-worker" | "migrator";

export type DbClient = Readonly<{
  role: RuntimeRole;
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<readonly T[]>;
}>;

export function createDbClient(role: RuntimeRole): DbClient {
  return {
    role,
    async query() {
      return [];
    },
  };
}

export function createRuntimeConnectionFactories() {
  return {
    api: () => createDbClient("api"),
    collab: () => createDbClient("collab"),
    dispatcher: () => createDbClient("dispatcher"),
    generationWorker: () => createDbClient("generation-worker"),
    mediaWorker: () => createDbClient("media-worker"),
    migrator: () => createDbClient("migrator"),
  };
}
