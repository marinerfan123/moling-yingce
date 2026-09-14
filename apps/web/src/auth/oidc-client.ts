export type OidcTokens = Readonly<{ accessToken: string; refreshToken: string; expiresAt: number }>;
type AuthorizationRecovery = Readonly<{ prompt: "none" | "login" }>;
type Authorize = (request: AuthorizationRecovery) => Promise<OidcTokens | null>;
type EstablishServerSession = (accessToken: string) => Promise<unknown>;

export type ReloadRecoveryResult =
  | Readonly<{ status: "authenticated" }>
  | Readonly<{ status: "login-required"; authorization: Readonly<{ prompt: "login" }> }>;

export class OidcMemoryClient {
  #tokens: OidcTokens | null = null;
  readonly #storage: StorageLike[];

  constructor(
    storage: StorageLike[] = [globalThis.localStorage, globalThis.sessionStorage].filter(Boolean) as StorageLike[],
  ) {
    this.#storage = storage;
  }

  createAuthorizationRequest(input: { state: string; nonce: string; codeVerifier: string }) {
    return {
      responseType: "code",
      codeChallengeMethod: "S256",
      state: input.state,
      nonce: input.nonce,
      codeVerifier: input.codeVerifier,
    };
  }

  setTokens(tokens: OidcTokens) {
    for (const storage of this.#storage) {
      if (storage.getItem("accessToken") || storage.getItem("refreshToken"))
        throw new Error("OIDC_TOKEN_PERSISTENCE_FORBIDDEN");
    }
    this.#tokens = tokens;
  }

  currentAccessToken() {
    return this.#tokens?.accessToken ?? null;
  }

  establishServerSession(establish: (accessToken: string) => Promise<unknown>) {
    const accessToken = this.currentAccessToken();
    if (!accessToken) return Promise.reject(new Error("OIDC_ACCESS_TOKEN_MISSING"));
    return establish(accessToken);
  }

  recoverAfterReload(providerSessionActive: boolean) {
    return providerSessionActive ? { prompt: "none" as const } : { prompt: "login" as const };
  }

  async restoreAfterReload(
    providerSessionActive: boolean,
    authorize: Authorize,
    establish?: EstablishServerSession,
  ): Promise<ReloadRecoveryResult> {
    const recovery = this.recoverAfterReload(providerSessionActive);
    if (recovery.prompt === "login") return { status: "login-required", authorization: recovery };

    try {
      const tokens = await authorize(recovery);
      if (!tokens) return { status: "login-required", authorization: { prompt: "login" } };
      this.setTokens(tokens);
      if (establish) await this.establishServerSession(establish);
      return { status: "authenticated" };
    } catch {
      this.logout();
      return { status: "login-required", authorization: { prompt: "login" } };
    }
  }

  logout() {
    this.#tokens = null;
  }
}

type StorageLike = Pick<Storage, "getItem">;
