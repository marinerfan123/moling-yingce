import { createRemoteJWKSet, jwtVerify } from "jose";

import type { AuthSessionIdentity } from "./session.js";

export type OidcSessionIssuerOptions = Readonly<{
  issuer: string;
  audience: string;
  jwksUrl?: string;
  verifyToken?: (accessToken: string) => Promise<AuthSessionIdentity>;
}>;

export function createOidcSessionIssuer(options: OidcSessionIssuerOptions) {
  const issuer = normalizeIssuer(options.issuer);
  if (!options.audience) throw new Error("OIDC_AUDIENCE_REQUIRED");

  const verifyToken =
    options.verifyToken ??
    createJwtVerifier({
      issuer,
      audience: options.audience,
      ...(options.jwksUrl ? { jwksUrl: options.jwksUrl } : {}),
    });

  return async (authorizationHeader: string): Promise<AuthSessionIdentity> => {
    const accessToken = readBearerToken(authorizationHeader);
    return verifyToken(accessToken);
  };
}

export function createEnvironmentAuthSessionIssuer(environment: NodeJS.ProcessEnv = process.env) {
  const issuer = environment["OIDC_ISSUER"];
  if (!issuer) return undefined;
  const audience = environment["OIDC_AUDIENCE"] ?? "comic-api";
  const jwksUrl = environment["OIDC_JWKS_URL"];
  return createOidcSessionIssuer({ issuer, audience, ...(jwksUrl ? { jwksUrl } : {}) });
}

function createJwtVerifier(options: Readonly<{ issuer: string; audience: string; jwksUrl?: string }>) {
  const jwks = createRemoteJWKSet(new URL(options.jwksUrl ?? `${options.issuer}/protocol/openid-connect/certs`));
  return async (accessToken: string): Promise<AuthSessionIdentity> => {
    const { payload } = await jwtVerify(accessToken, jwks, {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: ["RS256"],
    });
    if (typeof payload.iss !== "string" || typeof payload.sub !== "string") {
      throw new Error("OIDC_REQUIRED_CLAIMS_MISSING");
    }
    return { issuer: payload.iss, subject: payload.sub, audience: options.audience };
  };
}

function readBearerToken(authorizationHeader: string) {
  if (!authorizationHeader.startsWith("Bearer ")) throw new Error("AUTHORIZATION_REQUIRED");
  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) throw new Error("AUTHORIZATION_REQUIRED");
  return token;
}

function normalizeIssuer(issuer: string) {
  const normalized = issuer.replace(/\/$/, "");
  new URL(normalized);
  return normalized;
}
