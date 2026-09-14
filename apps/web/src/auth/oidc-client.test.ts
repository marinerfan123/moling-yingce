import { describe, expect, it, vi } from "vitest";

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

  it("does not retain tokens when persisted token data is detected", () => {
    const client = new OidcMemoryClient([{ getItem: (key: string) => (key === "accessToken" ? "legacy" : null) }]);

    expect(() =>
      client.setTokens({ accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 60_000 }),
    ).toThrow("OIDC_TOKEN_PERSISTENCE_FORBIDDEN");
    expect(client.currentAccessToken()).toBeNull();
  });

  it("exchanges the in-memory access token for a server session cookie", async () => {
    const client = new OidcMemoryClient([]);
    client.setTokens({ accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 60_000 });
    const establish = vi.fn(async (accessToken: string) => ({ user: { subject: accessToken } }));

    await expect(client.establishServerSession(establish)).resolves.toEqual({ user: { subject: "access" } });
    expect(establish).toHaveBeenCalledWith("access");
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

  it("restores a fresh client after reload through the provider session", async () => {
    const storage = { getItem: () => null };
    const client = new OidcMemoryClient([storage]);
    const authorize = vi.fn(async (request: { prompt: "none" | "login" }) => {
      expect(request).toEqual({ prompt: "none" });
      return { accessToken: "recovered-access", refreshToken: "recovered-refresh", expiresAt: Date.now() + 60_000 };
    });

    await expect(client.restoreAfterReload(true, authorize)).resolves.toEqual({ status: "authenticated" });
    expect(client.currentAccessToken()).toBe("recovered-access");
    expect(authorize).toHaveBeenCalledOnce();
  });

  it("falls back to interactive login when silent recovery is rejected", async () => {
    const client = new OidcMemoryClient([]);
    const authorize = vi.fn(async () => {
      throw new Error("login_required");
    });

    await expect(client.restoreAfterReload(true, authorize)).resolves.toEqual({
      status: "login-required",
      authorization: { prompt: "login" },
    });
    expect(client.currentAccessToken()).toBeNull();
  });

  it("establishes the server session after silent token recovery", async () => {
    const client = new OidcMemoryClient([]);
    const establish = vi.fn(async (accessToken: string) => ({ user: { subject: accessToken } }));
    const authorize = vi.fn(async () => ({
      accessToken: "recovered-access",
      refreshToken: "recovered-refresh",
      expiresAt: Date.now() + 60_000,
    }));

    await expect(client.restoreAfterReload(true, authorize, establish)).resolves.toEqual({ status: "authenticated" });
    expect(establish).toHaveBeenCalledWith("recovered-access");
  });

  it("does not keep recovered tokens when server session establishment fails", async () => {
    const client = new OidcMemoryClient([]);
    const authorize = vi.fn(async () => ({
      accessToken: "recovered-access",
      refreshToken: "recovered-refresh",
      expiresAt: Date.now() + 60_000,
    }));

    await expect(
      client.restoreAfterReload(true, authorize, async () => {
        throw new Error("session rejected");
      }),
    ).resolves.toEqual({ status: "login-required", authorization: { prompt: "login" } });
    expect(client.currentAccessToken()).toBeNull();
  });
});
