import { describe, expect, it, vi } from "vitest";

import { completeAuthCallback } from "./auth-callback.js";
import { OidcMemoryClient } from "./oidc-client.js";

const tokens = { accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 60_000 };
const user = { issuer: "https://issuer.test", subject: "user-123", audience: "comic-api" };

describe("OIDC callback", () => {
  it("exchanges the code and establishes the HttpOnly server session", async () => {
    const oidcClient = new OidcMemoryClient([]);
    const exchangeCode = vi.fn(async () => tokens);
    const establish = vi.fn(async (_accessToken: string) => ({ user }));

    await expect(
      completeAuthCallback({
        search: "?code=authorization-code&state=state",
        exchangeCode,
        oidcClient,
        authSessionClient: { establish },
      }),
    ).resolves.toEqual({ status: "success" });
    expect(exchangeCode).toHaveBeenCalledWith(expect.any(URLSearchParams));
    expect(establish).toHaveBeenCalledWith("access");
    expect(oidcClient.currentAccessToken()).toBe("access");
  });

  it("clears in-memory tokens when the server rejects the callback", async () => {
    const oidcClient = new OidcMemoryClient([]);
    const establish = vi.fn(async () => {
      throw new Error("invalid access token");
    });

    await expect(
      completeAuthCallback({
        search: "?code=authorization-code",
        exchangeCode: async () => tokens,
        oidcClient,
        authSessionClient: { establish },
      }),
    ).resolves.toEqual({ status: "failed", reason: "AUTH_CALLBACK_FAILED" });
    expect(oidcClient.currentAccessToken()).toBeNull();
  });

  it("does not exchange an IdP error response", async () => {
    const exchangeCode = vi.fn(async () => tokens);

    await expect(
      completeAuthCallback({
        search: "?error=access_denied",
        exchangeCode,
        oidcClient: new OidcMemoryClient([]),
        authSessionClient: { establish: async () => ({ user: null }) },
      }),
    ).resolves.toEqual({ status: "failed", reason: "access_denied" });
    expect(exchangeCode).not.toHaveBeenCalled();
  });
});
