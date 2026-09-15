import { PostgresAttemptRepository } from "./postgres-attempt-repository.js";
import type { GenerationWorkerProductionDependencies } from "./main.js";
import type { ModelProviderAdapter } from "./provider-contracts.js";

export function createReferenceProviderAdapter(): ModelProviderAdapter {
  return {
    providerKey: "reference",
    recoveryMode: "unsupported",
    validate: () => ({ ok: false }),
    submit: async () => Promise.reject(new Error("PROVIDER_ADAPTER_NOT_CONFIGURED")),
    recover: async () => ({ kind: "unsupported" as const }),
    cancel: async () => ({ kind: "unsupported" as const }),
    parseWebhook: async () => Promise.reject(new Error("PROVIDER_ADAPTER_NOT_CONFIGURED")),
    normalizeError: () => ({ code: "PROVIDER_ADAPTER_NOT_CONFIGURED", retryable: false }),
  };
}

/** Boots the reference worker without enabling fake generation or claiming readiness. */
export function createProductionGenerationDependencies(
  environment: NodeJS.ProcessEnv = process.env,
): GenerationWorkerProductionDependencies & { readonly referenceOnly: true } {
  if (environment["COMIC_CANVAS_REFERENCE_RUNTIME"] !== "true") {
    throw new Error("GENERATION_PROVIDER_ADAPTER_REQUIRED");
  }
  // The reference runtime only needs the query shape; the durable DB adapter is not shipped yet.
  const db = createReferenceDbClient("generation-worker");
  return {
    db,
    queue: { kind: "reference" },
    adapter: createReferenceProviderAdapter(),
    consumer: { start: () => undefined },
    attempts: new PostgresAttemptRepository(db),
    referenceOnly: true,
  };
}

function createReferenceDbClient(role: "generation-worker") {
  return {
    role,
    async query(_sql: string, _params: readonly unknown[]) {
      return [] as readonly Record<string, unknown>[];
    },
  };
}
