import { describe, expect, it } from "vitest";

import { verifyCollabSession } from "../src/auth.js";

describe("collab session auth", () => {
  it("rejects bad token metadata and intersects viewer capabilities", () => {
    const claims = {
      issuer: "comic-canvas:test",
      audience: "collab" as const,
      canvasId: "canvas_12345678",
      tenantId: "tenant_12345678",
      userId: "user_12345678",
      capabilities: ["read", "canvas:edit"] as const,
      sessionRevision: 1,
      kid: "kid_live_1",
      alg: "EdDSA" as const,
      exp: 9999999999,
    };
    expect(
      verifyCollabSession(claims, {
        issuer: "comic-canvas:test",
        canvasId: "canvas_12345678",
        sessionRevision: 1,
        allowedKids: ["kid_live_1"],
        roleCapabilities: ["read"],
      }),
    ).toMatchObject({
      capabilities: ["read"],
      readOnly: true,
    });
    expect(() =>
      verifyCollabSession(
        { ...claims, kid: "retired" },
        {
          issuer: "comic-canvas:test",
          canvasId: "canvas_12345678",
          sessionRevision: 1,
          allowedKids: ["kid_live_1"],
          roleCapabilities: ["read"],
        },
      ),
    ).toThrow(/COLLAB_SESSION_KID_UNKNOWN/);
  });
});
