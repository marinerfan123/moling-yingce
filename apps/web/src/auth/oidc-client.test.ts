import { describe, expect, it } from "vitest";

import { OidcMemoryClient } from "./oidc-client.js";

describe("OidcMemoryClient", () => {
  it("keeps access and refresh tokens in memory only", () => {
    const storage = { getItem: () => null };
    const client = new OidcMemoryClient([storage, storage]);
    client.setTokens({ accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 60_000 });
    expect(client.currentAccessToken()).toBe("access");
    client.logout();
    expect(client.currentAccessToken()).toBeNull();
  });

  it("uses prompt=none recovery before interactive fallback", () => {
    const client = new OidcMemoryClient([]);
    expect(client.recoverAfterReload(true)).toEqual({ prompt: "none" });
    expect(client.recoverAfterReload(false)).toEqual({ prompt: "login" });
    expect(client.createAuthorizationRequest({ state: "s", nonce: "n", codeVerifier: "v" })).toMatchObject({
      responseType: "code",
      codeChallengeMethod: "S256",
    });
  });
});
