import { z } from "zod";

import { AssetVersionIdSchema } from "./assets.js";
import { NodeIdSchema } from "./canvas.js";
import { JobIdSchema, ProjectIdSchema, TenantIdSchema } from "./ids.js";
import { ModelCapabilitySchema, ModelKeySchema, ModelProviderKeySchema, ProviderCurrencySchema } from "./models.js";
import { MoneyMicrosSchema } from "./money.js";

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const GENERATION_JOB_STATES = [
  "pending",
  "queued",
  "dispatching",
  "running",
  "reconciling",
  "succeeded",
  "failed",
  "canceled",
] as const;
export const TERMINAL_JOB_STATES = ["succeeded", "failed", "canceled"] as const;
export const NONTERMINAL_JOB_STATES = ["pending", "queued", "dispatching", "running", "reconciling"] as const;

const terminalStateSet = new Set<string>(TERMINAL_JOB_STATES);
export const GenerationJobStateSchema = z.enum(GENERATION_JOB_STATES);
export const TerminalGenerationJobStateSchema = z.enum(TERMINAL_JOB_STATES);
export const NonterminalGenerationJobStateSchema = z.enum(NONTERMINAL_JOB_STATES);
export const GenerationCancellationStateSchema = z.enum([
  "none",
  "requested",
  "acknowledged",
  "unsupported",
  "unknown",
]);

export function isGenerationJobTerminal(state: GenerationJobState): state is TerminalGenerationJobState {
  return terminalStateSet.has(state);
}

const EvidenceSchema = z
  .object({
    source: z.enum(["provider", "system", "webhook", "poll", "authoritative_lookup"]),
    observedAt: z.string().datetime(),
    reference: z.string().trim().min(1),
    checksum: Sha256Schema.optional(),
  })
  .strict()
  .readonly();

export const ProviderBillingSchema = z
  .object({
    billedMicros: MoneyMicrosSchema,
    currency: ProviderCurrencySchema,
    evidence: EvidenceSchema,
  })
  .strict()
  .readonly();

export const ProviderOutputSchema = z
  .object({
    kind: ModelCapabilitySchema,
    assetVersionId: AssetVersionIdSchema.optional(),
    locator: z.string().url().startsWith("https://").optional(),
    contentSha256: Sha256Schema.optional(),
    mime: z.string().min(3).optional(),
  })
  .strict()
  .readonly();

export const GenerationRequestSchema = z
  .object({
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    jobId: JobIdSchema,
    providerKey: ModelProviderKeySchema,
    modelKey: ModelKeySchema,
    capability: ModelCapabilitySchema,
    submissionKey: z.string().trim().min(12).max(160),
    prompt: z.string().max(64_000).optional(),
    inputAssetVersionIds: z.array(AssetVersionIdSchema).readonly().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .readonly();

export const GenerationEstimateLineSchema = z
  .object({
    label: z.string().trim().min(1),
    micros: MoneyMicrosSchema,
  })
  .strict()
  .readonly();

export const GenerationEstimateSchema = z
  .object({
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    sourceNodeId: NodeIdSchema,
    providerKey: ModelProviderKeySchema,
    modelKey: ModelKeySchema,
    capability: ModelCapabilitySchema,
    inputSnapshotHash: Sha256Schema,
    configSnapshotHash: Sha256Schema,
    currency: ProviderCurrencySchema,
    estimatedMicros: MoneyMicrosSchema,
    lines: z.array(GenerationEstimateLineSchema).min(1).readonly(),
    retentionDays: z.number().int().positive(),
    cancellation: z
      .object({
        state: GenerationCancellationStateSchema,
        billingTerms: z.string().trim().min(1),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

export const GenerationJobSchema = z
  .object({
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    jobId: JobIdSchema,
    sourceNodeId: NodeIdSchema,
    providerKey: ModelProviderKeySchema,
    modelKey: ModelKeySchema,
    capability: ModelCapabilitySchema,
    state: GenerationJobStateSchema,
    cancellationState: GenerationCancellationStateSchema,
    inputSnapshotHash: Sha256Schema,
    configSnapshotHash: Sha256Schema,
    outputAssetVersionId: AssetVersionIdSchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .readonly();

export const ProviderStatusSchema = z
  .object({
    externalId: z.string().trim().min(1),
    normalizedStatus: z.enum(["queued", "running", "succeeded", "failed", "canceled"]),
    progressStage: z.enum(["accepted", "queued", "generating", "uploading", "moderating", "complete"]),
    terminalReason: z.string().trim().min(1).optional(),
    outputs: z.array(ProviderOutputSchema).readonly(),
    billing: ProviderBillingSchema.nullable(),
    evidence: EvidenceSchema,
  })
  .strict()
  .readonly();

export const ProviderEventSchema = z
  .object({
    providerKey: ModelProviderKeySchema,
    externalId: z.string().trim().min(1),
    eventId: z.string().trim().min(1),
    status: ProviderStatusSchema,
    receivedAt: z.string().datetime(),
  })
  .strict()
  .readonly();

export type ProviderEvidence = z.infer<typeof EvidenceSchema>;
export type GenerationJobState = z.infer<typeof GenerationJobStateSchema>;
export type TerminalGenerationJobState = z.infer<typeof TerminalGenerationJobStateSchema>;
export type NonterminalGenerationJobState = z.infer<typeof NonterminalGenerationJobStateSchema>;
export type GenerationCancellationState = z.infer<typeof GenerationCancellationStateSchema>;
export type GenerationEstimateLine = z.infer<typeof GenerationEstimateLineSchema>;
export type GenerationEstimate = z.infer<typeof GenerationEstimateSchema>;
export type GenerationJob = z.infer<typeof GenerationJobSchema>;
export type ProviderBilling = z.infer<typeof ProviderBillingSchema>;
export type ProviderOutput = z.infer<typeof ProviderOutputSchema>;
export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;
export type ProviderEvent = z.infer<typeof ProviderEventSchema>;
