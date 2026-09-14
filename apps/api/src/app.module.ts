export class AppModule {}
export const apiControllers = Object.freeze([
  "HealthController",
  "TemplatesController",
  "UploadsController",
  "RemoteIngestController",
  "AssetsController",
  "ModelsController",
  "BillingController",
  "GenerationController",
  "SelectionsController",
  "ProviderWebhookController",
] as const);
export const apiModules = Object.freeze([
  "AuthModule",
  "ProjectsModule",
  "NarrativeModule",
  "GovernanceModule",
  "TemplatesModule",
  "UploadsModule",
  "AssetsModule",
  "ModelsModule",
  "BillingModule",
  "GenerationModule",
  "SelectionsModule",
] as const);
export const apiSecurityPolicies = Object.freeze({
  csp: "default-src 'self'; img-src 'self' https: data:; media-src 'self' https:; connect-src 'self' wss: https:",
  cors: "explicit-allowlist",
  csrf: "double-submit-cookie",
  rateLimit: "tenant+user+route",
  maxJsonBodyBytes: 1_000_000,
} as const);
export const apiPlatformInterceptors = Object.freeze([
  "IdempotencyInterceptor",
  "TraceInterceptor",
  "ApiErrorFilter",
] as const);
export const apiInternalClients = Object.freeze(["CanvasDocumentReader"] as const);
