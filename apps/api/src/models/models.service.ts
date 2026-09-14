export type ModelCapability = "text" | "image" | "video" | "tts";

export interface ModelCatalogEntry {
  readonly id: string;
  readonly providerConfigId: string;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly displayName: string;
  readonly capabilities: readonly ModelCapability[];
  readonly recoveryMode: "idempotency-key" | "client-reference-query" | "unsupported";
  readonly price: {
    readonly inputMicros: string;
    readonly outputMicros: string;
    readonly currency: "USD" | "CNY" | "EUR" | "JPY" | "KRW";
    readonly unit: "request" | "token" | "second" | "image" | "frame";
  };
  readonly enabled: boolean;
  readonly updatedAt: string;
}

export interface ModelCatalogResponse {
  readonly models: readonly ModelCatalogEntry[];
}

export const BUILTIN_MODEL_CATALOG: readonly ModelCatalogEntry[] = Object.freeze([
  {
    id: "model_12345678",
    providerConfigId: "providercfg_12345678",
    providerKey: "system-catalog",
    modelKey: "system-catalog/commercial-canvas",
    displayName: "Commercial Canvas Catalog",
    capabilities: ["text", "image", "video", "tts"],
    recoveryMode: "unsupported",
    price: { inputMicros: "0", outputMicros: "0", currency: "USD", unit: "request" },
    enabled: true,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]);

export type ModelsPrincipal = Readonly<{
  tenantId: string;
  userId: string;
  memberships: readonly { projectId: string; role?: string; active: boolean }[];
}>;

export class ModelsService {
  list(
    principal: ModelsPrincipal,
    input: Readonly<{ projectId: string; capability?: ModelCapability }>,
  ): ModelCatalogResponse {
    this.assertAccess(principal, input.projectId);
    const models = BUILTIN_MODEL_CATALOG.filter(
      (model) => model.enabled && (!input.capability || model.capabilities.includes(input.capability)),
    );
    return { models };
  }

  private assertAccess(principal: ModelsPrincipal, projectId: string) {
    if (
      !principal.tenantId ||
      !principal.memberships.some((membership) => membership.projectId === projectId && membership.active)
    ) {
      throw new Error("PROJECT_MEMBERSHIP_MISSING");
    }
  }
}
