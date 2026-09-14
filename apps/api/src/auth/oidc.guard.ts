export type VerifiedOidcPrincipal = Readonly<{
  issuer: string;
  subject: string;
  audience: string;
  expiresAt: number;
}>;

export class OidcGuard {
  verify(
    claims: VerifiedOidcPrincipal,
    expected: { issuer: string; audience: string },
    nowSeconds = Math.floor(Date.now() / 1000),
  ) {
    if (claims.issuer !== expected.issuer) throw new Error("OIDC_ISSUER_MISMATCH");
    if (claims.audience !== expected.audience) throw new Error("OIDC_AUDIENCE_MISMATCH");
    if (claims.expiresAt <= nowSeconds) throw new Error("OIDC_TOKEN_EXPIRED");
    return claims;
  }
}
