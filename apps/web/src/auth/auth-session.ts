export type AuthSessionUser = Readonly<{
  issuer: string;
  subject: string;
  audience: string;
}>;

export type AuthSessionPayload = Readonly<{ user: AuthSessionUser | null }>;
export type WebAuthState =
  | Readonly<{ status: "authenticated"; user: AuthSessionUser }>
  | Readonly<{ status: "anonymous"; user: null }>;

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type AuthSessionReader = Pick<AuthSessionClient, "getSession">;

export class AuthSessionClient {
  readonly #fetcher: Fetcher;
  readonly #basePath: string;

  constructor(fetcher: Fetcher = defaultFetcher, basePath = "/v1/auth") {
    this.#fetcher = fetcher;
    this.#basePath = basePath.replace(/\/$/, "");
  }

  getSession() {
    return this.#request<AuthSessionPayload>("/session", { method: "GET" });
  }

  establish(accessToken: string) {
    if (!accessToken) throw new Error("AUTH_ACCESS_TOKEN_REQUIRED");
    return this.#request<AuthSessionPayload>("/session", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }

  logout() {
    return this.#request<Readonly<{ ok: true }>>("/logout", { method: "POST" });
  }

  async #request<T>(path: string, init: RequestInit) {
    const response = await this.#fetcher(`${this.#basePath}${path}`, { ...init, credentials: "include" });
    if (!response.ok) throw new Error(`AUTH_SESSION_HTTP_${response.status}`);
    return (await response.json()) as T;
  }
}

export async function hydrateWebSession(client: AuthSessionReader = new AuthSessionClient()): Promise<WebAuthState> {
  try {
    const payload = await client.getSession();
    return payload.user ? { status: "authenticated", user: payload.user } : { status: "anonymous", user: null };
  } catch {
    return { status: "anonymous", user: null };
  }
}

const defaultFetcher: Fetcher = (input, init) => fetch(input, init);
