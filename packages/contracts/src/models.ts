import { z } from "zod";

import { MoneyMicrosSchema } from "./money.js";

const opaqueId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-zA-Z0-9][a-zA-Z0-9_-]{7,}$`), `${prefix} id must be opaque and prefixed`);

export const ProviderConfigIdSchema = opaqueId("providercfg");
export const ModelCatalogIdSchema = opaqueId("model");
export const ModelProviderKeySchema = z.string().regex(/^[a-z][a-z0-9_-]{1,47}$/);
export const ModelKeySchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{1,95}$/);
export const ModelCapabilitySchema = z.enum(["text", "image", "video", "tts"]);
export const ProviderRecoveryModeSchema = z.enum(["idempotency-key", "client-reference-query", "unsupported"]);
export const ProviderCurrencySchema = z.enum(["USD", "CNY", "EUR", "JPY", "KRW"]);

export const ModelPriceSchema = z
  .object({
    inputMicros: MoneyMicrosSchema,
    outputMicros: MoneyMicrosSchema,
    currency: ProviderCurrencySchema,
    unit: z.enum(["request", "token", "second", "image", "frame"]),
  })
  .strict()
  .readonly();

const ModelDescriptorBaseSchema = z
  .object({
    providerKey: ModelProviderKeySchema,
    modelKey: ModelKeySchema,
    displayName: z.string().trim().min(1).max(120),
    capabilities: z.array(ModelCapabilitySchema).min(1).readonly(),
    recoveryMode: ProviderRecoveryModeSchema,
    price: ModelPriceSchema,
    maxInputTokens: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    enabled: z.boolean(),
  })
  .strict();

export const ModelDescriptorSchema = ModelDescriptorBaseSchema.readonly();

export const ModelCatalogEntrySchema = ModelDescriptorBaseSchema.extend({
  id: ModelCatalogIdSchema,
  providerConfigId: ProviderConfigIdSchema,
  updatedAt: z.string().datetime(),
})
  .strict()
  .readonly();

export const ModelCatalogResponseSchema = z
  .object({
    models: z.array(ModelCatalogEntrySchema).readonly(),
  })
  .strict()
  .readonly();

export type ProviderConfigId = z.infer<typeof ProviderConfigIdSchema>;
export type ModelCatalogId = z.infer<typeof ModelCatalogIdSchema>;
export type ModelProviderKey = z.infer<typeof ModelProviderKeySchema>;
export type ModelKey = z.infer<typeof ModelKeySchema>;
export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;
export type ProviderRecoveryMode = z.infer<typeof ProviderRecoveryModeSchema>;
export type ProviderCurrency = z.infer<typeof ProviderCurrencySchema>;
export type ModelPrice = z.infer<typeof ModelPriceSchema>;
export type ModelDescriptor = z.infer<typeof ModelDescriptorSchema>;
export type ModelCatalogEntry = z.infer<typeof ModelCatalogEntrySchema>;
export type ModelCatalogResponse = z.infer<typeof ModelCatalogResponseSchema>;
