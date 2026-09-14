export type CollabSessionClaims = Readonly<{
  issuer: string;
  audience: "collab";
  canvasId: string;
  tenantId: string;
  userId: string;
  capabilities: readonly ("read" | "comment" | "canvas:edit")[];
  sessionRevision: number;
  kid: string;
  alg: "EdDSA";
  exp: number;
}>;

export function verifyCollabSession(
  claims: CollabSessionClaims,
  expected: {
    issuer: string;
    canvasId: string;
    sessionRevision: number;
    allowedKids: readonly string[];
    nowSeconds?: number;
    roleCapabilities: readonly string[];
  },
) {
  if (claims.issuer !== expected.issuer) throw new Error("COLLAB_SESSION_ISSUER_INVALID");
  if (claims.audience !== "collab") throw new Error("COLLAB_SESSION_AUDIENCE_INVALID");
  if (claims.alg !== "EdDSA") throw new Error("COLLAB_SESSION_ALG_INVALID");
  if (!expected.allowedKids.includes(claims.kid)) throw new Error("COLLAB_SESSION_KID_UNKNOWN");
  if (claims.canvasId !== expected.canvasId) throw new Error("COLLAB_SESSION_CANVAS_MISMATCH");
  if (claims.sessionRevision !== expected.sessionRevision) throw new Error("COLLAB_SESSION_REVISION_STALE");
  if (claims.exp <= (expected.nowSeconds ?? Math.floor(Date.now() / 1000))) throw new Error("COLLAB_SESSION_EXPIRED");
  const capabilitySet = new Set(expected.roleCapabilities);
  return {
    ...claims,
    capabilities: claims.capabilities.filter((capability) => capabilitySet.has(capability)),
    readOnly: !claims.capabilities.includes("canvas:edit") || !capabilitySet.has("canvas:edit"),
  };
}
