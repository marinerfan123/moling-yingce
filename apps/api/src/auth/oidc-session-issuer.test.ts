import { describe, expect, it } from "vitest";

import { createEnvironmentAuthSessionIssuer, createOidcSessionIssuer } from "./oidc-session-issuer.js";

const identity = { issuer: "https://issuer.test", subject: "user-123", audience: "comic-api" };

describe("OIDC auth session issuer", () => {
  it("passes only the bearer token to the verified issuer", async () => {
    let received = "";
    const issuer = createOidcSessionIssuer({
      issuer: identity.issuer,
      audience: identity.audience,
      verifyToken: async (accessToken) => {
        received = accessToken;
        return identity;
      },
    });

    await expect(issuer("Bearer signed-access-token")).resolves.toEqual(identity);
    expect(received).toBe("signed-access-token");
  });

  it("rejects an empty bearer token", async () => {
    const issuer = createOidcSessionIssuer({
      issuer: identity.issuer,
      audience: identity.audience,
      verifyToken: async () => identity,
    });

    await expect(issuer("Bearer ")).rejects.toThrow("AUTHORIZATION_REQUIRED");
  });

  it("builds the production issuer from OIDC environment settings", async () => {
    const issuer = createEnvironmentAuthSessionIssuer({
      OIDC_ISSUER: identity.issuer,
      OIDC_AUDIENCE: identity.audience,
    });

    expect(issuer).toBeTypeOf("function");
  });
});
