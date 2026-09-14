export class AuthModule {}

export const authProviders = Object.freeze([
  "OidcGuard",
  "AuthSessionStore",
  "AuthSessionIssuer",
  "BetaAccessGuard",
  "BetaAccessService",
  "AuthorizationService",
] as const);
