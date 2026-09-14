export type TestApiClient = Readonly<{
  baseURL: string;
  get(path: string): Promise<{ status: number; body: unknown }>;
}>;

export function createTestApiClient(baseURL = "http://127.0.0.1:4173"): TestApiClient {
  return {
    baseURL,
    async get(path) {
      return { status: 200, body: { path, baseURL } };
    },
  };
}
