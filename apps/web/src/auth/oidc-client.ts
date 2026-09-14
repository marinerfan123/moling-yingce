export type OidcTokens = Readonly<{ accessToken: string; refreshToken: string; expiresAt: number }>;

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
    this.#tokens = tokens;
    for (const storage of this.#storage) {
      if (storage.getItem("accessToken") || storage.getItem("refreshToken"))
        throw new Error("OIDC_TOKEN_PERSISTENCE_FORBIDDEN");
    }
  }

  currentAccessToken() {
    return this.#tokens?.accessToken ?? null;
  }

  recoverAfterReload(providerSessionActive: boolean) {
    return providerSessionActive ? { prompt: "none" as const } : { prompt: "login" as const };
  }

  logout() {
    this.#tokens = null;
  }
}

type StorageLike = Pick<Storage, "getItem">;
