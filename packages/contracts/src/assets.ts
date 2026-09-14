import { z } from "zod";

import { JobIdSchema, ProjectIdSchema, TenantIdSchema } from "./ids.js";
import { ModerationRecordIdSchema, RightsRecordIdSchema } from "./governance.js";

const opaqueId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-zA-Z0-9][a-zA-Z0-9_-]{7,}$`), `${prefix} id must be opaque and prefixed`);
const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const AssetIdSchema = opaqueId("asset");
export const AssetVersionIdSchema = opaqueId("assetver");
export const AssetVariantIdSchema = opaqueId("assetvar");
export const UploadSessionIdSchema = opaqueId("upload");
export const RemoteIngestInstructionIdSchema = opaqueId("ingest");

export const MediaMetadataSchema = z
  .object({
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    frameRate: z.number().positive().optional(),
    channels: z.number().int().positive().optional(),
    sampleRate: z.number().int().positive().optional(),
    codec: z.string().trim().min(1).optional(),
  })
  .strict();

export const AssetStatusSchema = z.enum(["quarantined", "scanning", "ready", "rejected", "expired"]);
export const AssetVersionStatusSchema = z.enum(["quarantined", "scanning", "ready", "rejected", "expired"]);
export const AssetVariantStatusSchema = z.enum(["quarantined", "ready", "rejected"]);

export const AssetSchema = z
  .object({
    id: AssetIdSchema,
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    kind: z.enum(["image", "video", "audio", "document", "font", "other"]),
    status: AssetStatusSchema,
    currentVersionId: AssetVersionIdSchema.nullable(),
    createdAt: z.string().datetime(),
  })
  .strict()
  .readonly();

export const AssetVersionSchema = z
  .object({
    id: AssetVersionIdSchema,
    assetId: AssetIdSchema,
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    sha256: Sha256Schema,
    byteSize: z.number().int().nonnegative(),
    detectedMime: z.string().regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/),
    mediaMetadata: MediaMetadataSchema,
    rightsRecordId: RightsRecordIdSchema.nullable(),
    moderationRecordId: ModerationRecordIdSchema.nullable(),
    sourceJobId: JobIdSchema.nullable(),
    status: AssetVersionStatusSchema,
    createdAt: z.string().datetime(),
  })
  .strict()
  .readonly();

export const AssetVariantSchema = z
  .object({
    id: AssetVariantIdSchema,
    assetVersionId: AssetVersionIdSchema,
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    variant: z.enum(["original", "thumbnail", "poster", "proxy", "waveform", "mezzanine"]),
    objectVersionId: z.string().trim().min(1),
    sha256: Sha256Schema,
    byteSize: z.number().int().nonnegative(),
    detectedMime: z.string().min(3),
    status: AssetVariantStatusSchema,
    createdAt: z.string().datetime(),
  })
  .strict()
  .readonly();

export const UploadSessionSchema = z
  .object({
    id: UploadSessionIdSchema,
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    assetId: AssetIdSchema,
    status: z.enum(["created", "uploading", "completed", "aborted", "expired"]),
    declaredMime: z.string().min(3),
    declaredByteSize: z.number().int().positive(),
    expiresAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  })
  .strict()
  .readonly();

export const RemoteIngestInstructionSchema = z
  .object({
    id: RemoteIngestInstructionIdSchema,
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    locator: z.string().url().startsWith("https://"),
    declaredMime: z.string().min(3),
    maxBytes: z.number().int().positive().max(500_000_000),
    expiresAt: z.string().datetime(),
    requestSha256: Sha256Schema,
    state: z.enum(["pending", "bootstrapped", "fetching", "consumed", "failed", "expired"]),
  })
  .strict()
  .readonly();

export type Asset = z.infer<typeof AssetSchema>;
export type AssetVersion = z.infer<typeof AssetVersionSchema>;
export type AssetVariant = z.infer<typeof AssetVariantSchema>;
export type UploadSession = z.infer<typeof UploadSessionSchema>;
export type RemoteIngestInstruction = z.infer<typeof RemoteIngestInstructionSchema>;

export const MezzanineRecipeSchema = z
  .object({
    codec: z.literal("H.264"),
    pixelFormat: z.literal("yuv420p"),
    frameRateNumerator: z.literal(25),
    frameRateDenominator: z.literal(1),
    constantFrameRate: z.literal(true),
  })
  .strict()
  .readonly();

export const SourceFrameMappingSchema = z
  .object({
    sourceFrame: z.number().int().nonnegative(),
    mezzanineFrame: z.number().int().nonnegative(),
  })
  .strict()
  .readonly();

export const MezzanineVariantSchema = z
  .object({
    assetVersionId: AssetVersionIdSchema,
    assetVariantId: AssetVariantIdSchema,
    objectVersionId: z.string().trim().min(1),
    byteSha256: Sha256Schema,
    recipe: MezzanineRecipeSchema,
    sourceToFrame: z.array(SourceFrameMappingSchema).min(1).readonly(),
    timelineEligible: z.literal(true),
  })
  .strict()
  .readonly();

export type MezzanineRecipe = z.infer<typeof MezzanineRecipeSchema>;
export type SourceFrameMapping = z.infer<typeof SourceFrameMappingSchema>;
export type MezzanineVariant = z.infer<typeof MezzanineVariantSchema>;

export function assertMezzanineVariant(value: unknown): MezzanineVariant {
  return MezzanineVariantSchema.parse(value);
}

export function isTimelineEligibleVideo(value: unknown): boolean {
  return MezzanineVariantSchema.safeParse(value).success;
}
