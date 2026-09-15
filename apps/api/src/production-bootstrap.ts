import { createEnvironmentAuthSessionIssuer } from "./auth/oidc-session-issuer.js";
import { InMemoryAuthSessionStore } from "./auth/session.js";
import { ProjectsController } from "./projects/projects.controller.js";
import { ProviderWebhookController } from "./providers/provider-webhook.controller.js";
import { TemplatesController } from "./templates/templates.controller.js";
import type { ApiProductionDependencies } from "./main.js";

/**
 * The repository does not yet ship durable provider-route/KMS adapters. Keep the
 * boundary explicit so the public shell can boot without pretending webhooks work.
 */
export function createProductionApiDependencies(
  environment: NodeJS.ProcessEnv = process.env,
): ApiProductionDependencies {
  const authSessionIssuer = createEnvironmentAuthSessionIssuer(environment);
  if (!authSessionIssuer) throw new Error("API_OIDC_ISSUER_REQUIRED");

  const db = createReferenceDbClient("api");
  const providerWebhook = new ProviderWebhookController(
    { resolve: async () => Promise.reject(new Error("WEBHOOK_SECRET_ADAPTER_NOT_CONFIGURED")) },
    { verify: async () => Promise.reject(new Error("WEBHOOK_VERIFIER_ADAPTER_NOT_CONFIGURED")) },
    {
      routeWebhook: async () => null,
      enqueueVerifiedEvent: async () => undefined,
    },
  );

  return {
    providerWebhook,
    replayStore: { kind: "reference", db },
    routeStore: { kind: "reference", db },
    kmsResolver: { kind: "reference" },
    authSessionStore: new InMemoryAuthSessionStore(),
    authSessionIssuer,
    projectsController: new ProjectsController(),
    templatesController: new TemplatesController(),
    runtimeProfile: "reference",
  };
}

function createReferenceDbClient(role: "api") {
  return {
    role,
    async query(_sql: string, _params?: readonly unknown[]) {
      return [];
    },
  };
}
