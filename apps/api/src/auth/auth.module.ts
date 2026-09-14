export class AuthModule {}

export const authProviders = Object.freeze([
  "OidcGuard",
  "BetaAccessGuard",
  "BetaAccessService",
  "AuthorizationService",
] as const);
