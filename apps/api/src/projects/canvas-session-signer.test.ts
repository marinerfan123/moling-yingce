import { decodeProtectedHeader, SignJWT } from "jose";
import { createSecretKey } from "node:crypto";
import { describe, expect, it } from "vitest";

import { CanvasSessionSigner } from "./canvas-session-signer.js";

describe("CanvasSessionSigner", () => {
  it("signs short collab-only EdDSA tokens and exposes no private key in JWKS", async () => {
    const signer = new CanvasSessionSigner({
      issuer: "comic-canvas:test",
      activeKid: "kid_live_001",
      maxTtlSeconds: 300,
    });
    const signed = await signer.sign({
      canvasId: "canvas_12345678",
      tenantId: "tenant_12345678",
      userId: "user_12345678",
      capabilities: ["canvas:edit", "read"],
      sessionRevision: 7,
      ttlSeconds: 999,
    });
    expect(signed.alg).toBe("EdDSA");
    expect(decodeProtectedHeader(signed.token)).toMatchObject({ alg: "EdDSA", kid: "kid_live_001" });
    const jwks = await signer.jwks();
    expect(jwks.keys[0]).not.toHaveProperty("d");
    const claims = await signer.verify(signed.token, { canvasId: "canvas_12345678", sessionRevision: 7 });
    expect(claims.capabilities).toEqual(["canvas:edit", "read"]);
  });

  it("rejects wrong canvas, stale session revision and algorithm confusion", async () => {
    const signer = new CanvasSessionSigner({ issuer: "comic-canvas:test", activeKid: "kid_live_001" });
    const signed = await signer.sign({
      canvasId: "canvas_12345678",
      tenantId: "tenant_12345678",
      userId: "user_12345678",
      capabilities: ["read"],
      sessionRevision: 1,
    });
    await expect(signer.verify(signed.token, { canvasId: "canvas_87654321" })).rejects.toThrow(
      /CANVAS_SESSION_CANVAS_MISMATCH/,
    );
    await expect(signer.verify(signed.token, { canvasId: "canvas_12345678", sessionRevision: 2 })).rejects.toThrow(
      /CANVAS_SESSION_REVISION_STALE/,
    );
    const confused = await new SignJWT({ canvasId: "canvas_12345678", sessionRevision: 1 })
      .setProtectedHeader({ alg: "HS256", kid: "kid_live_001" })
      .setIssuer("comic-canvas:test")
      .setAudience("collab")
      .setExpirationTime("5m")
      .sign(createSecretKey(new Uint8Array(32)));
    await expect(signer.verify(confused, { canvasId: "canvas_12345678" })).rejects.toThrow();
  });
});
