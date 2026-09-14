import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { exportJWK, importJWK, jwtVerify, SignJWT, type JWK, type JWTPayload } from "jose";

export type CanvasSessionCapability = "read" | "comment" | "canvas:edit";

export type CanvasSessionClaims = JWTPayload & {
  canvasId: string;
  tenantId: string;
  userId: string;
  capabilities: CanvasSessionCapability[];
  sessionRevision: number;
};

export type CanvasSessionSignerOptions = Readonly<{
  issuer: string;
  audience?: "collab";
  activeKid?: string;
  maxTtlSeconds?: number;
  keyPair?: { privateKey: KeyObject; publicKey: KeyObject };
}>;

export class CanvasSessionSigner {
  readonly #issuer: string;
  readonly #audience: "collab";
  readonly #activeKid: string;
  readonly #maxTtlSeconds: number;
  readonly #privateKey: KeyObject;
  readonly #publicKey: KeyObject;

  constructor(options: CanvasSessionSignerOptions) {
    this.#issuer = options.issuer;
    this.#audience = options.audience ?? "collab";
    this.#activeKid = options.activeKid ?? "kid_dev_canvas_session";
    this.#maxTtlSeconds = options.maxTtlSeconds ?? 300;
    const keyPair = options.keyPair ?? generateKeyPairSync("ed25519");
    this.#privateKey = keyPair.privateKey;
    this.#publicKey = keyPair.publicKey;
  }

  async sign(input: {
    canvasId: string;
    tenantId: string;
    userId: string;
    capabilities: CanvasSessionCapability[];
    sessionRevision: number;
    ttlSeconds?: number;
  }) {
    const ttl = Math.min(input.ttlSeconds ?? this.#maxTtlSeconds, this.#maxTtlSeconds);
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const token = await new SignJWT({
      canvasId: input.canvasId,
      tenantId: input.tenantId,
      userId: input.userId,
      capabilities: [...input.capabilities].sort(),
      sessionRevision: input.sessionRevision,
    })
      .setProtectedHeader({ alg: "EdDSA", kid: this.#activeKid, typ: "JWT" })
      .setIssuer(this.#issuer)
      .setAudience(this.#audience)
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .setIssuedAt()
      .sign(this.#privateKey);
    return {
      token,
      kid: this.#activeKid,
      alg: "EdDSA" as const,
      issuer: this.#issuer,
      audience: this.#audience,
      expiresAt: expiresAt.toISOString(),
      schemaVersion: 1 as const,
    };
  }

  async jwks(): Promise<{ keys: JWK[] }> {
    const key = await exportJWK(this.#publicKey);
    return { keys: [{ ...key, kid: this.#activeKid, alg: "EdDSA", key_ops: ["verify"] }] };
  }

  async verify(token: string, expected: { canvasId: string; sessionRevision?: number }) {
    const publicKey = (await this.jwks()).keys.find((key) => key.kid === this.#activeKid);
    if (!publicKey) throw new Error("CANVAS_SESSION_KID_UNKNOWN");
    const { payload, protectedHeader } = await jwtVerify(token, await importJWK(publicKey, "EdDSA"), {
      issuer: this.#issuer,
      audience: this.#audience,
      algorithms: ["EdDSA"],
    });
    if (protectedHeader.kid !== this.#activeKid) throw new Error("CANVAS_SESSION_KID_UNKNOWN");
    const claims = payload as CanvasSessionClaims;
    if (claims.canvasId !== expected.canvasId) throw new Error("CANVAS_SESSION_CANVAS_MISMATCH");
    if (expected.sessionRevision !== undefined && claims.sessionRevision !== expected.sessionRevision) {
      throw new Error("CANVAS_SESSION_REVISION_STALE");
    }
    return claims;
  }
}
