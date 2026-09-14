import { z } from "zod";

import { ProjectIdSchema, TenantIdSchema, UserIdSchema } from "./ids.js";

const opaqueId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-zA-Z0-9][a-zA-Z0-9_-]{7,}$`), `${prefix} id must be opaque and prefixed`);

export const EpisodeIdSchema = opaqueId("episode");
export const CanvasIdSchema = opaqueId("canvas");
export const TimelineIdSchema = opaqueId("timeline");
export const ScriptIdSchema = opaqueId("script");
export const ScriptRevisionIdSchema = opaqueId("scriptrev");
export const CopyPreviewIdSchema = opaqueId("copyprev");

export type EpisodeId = z.infer<typeof EpisodeIdSchema>;
export type CanvasId = z.infer<typeof CanvasIdSchema>;
export type TimelineId = z.infer<typeof TimelineIdSchema>;
export type ScriptId = z.infer<typeof ScriptIdSchema>;
export type ScriptRevisionId = z.infer<typeof ScriptRevisionIdSchema>;

export const ProjectSummarySchema = z
  .object({
    id: ProjectIdSchema,
    tenantId: TenantIdSchema,
    title: z.string().trim().min(1).max(120),
    ownerUserId: UserIdSchema,
    archivedAt: z.string().datetime().nullable().default(null),
    createdAt: z.string().datetime(),
  })
  .strict();

export const EpisodeSummarySchema = z
  .object({
    id: EpisodeIdSchema,
    projectId: ProjectIdSchema,
    title: z.string().trim().min(1).max(160),
    ordinal: z.number().int().min(1),
    canvasId: CanvasIdSchema,
    timelineId: TimelineIdSchema,
    scriptId: ScriptIdSchema,
    archivedAt: z.string().datetime().nullable().default(null),
  })
  .strict();

export const CreateProjectRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    firstEpisodeTitle: z.string().trim().min(1).max(160).default("第 1 集"),
  })
  .strict();

export const RenameEpisodeRequestSchema = z.object({ title: z.string().trim().min(1).max(160) }).strict();

export const CopyEpisodePreviewSchema = z
  .object({
    previewId: CopyPreviewIdSchema,
    sourceEpisodeId: EpisodeIdSchema,
    sourceHeadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    policyHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    copyPolicyVersion: z.literal(1),
    remap: z.record(z.string(), z.string()),
    excludedKinds: z.array(z.string()).min(1),
    reusableProjectRefs: z.array(z.string()).default([]),
  })
  .strict();

export const ConfirmEpisodeCopyRequestSchema = z
  .object({
    previewId: CopyPreviewIdSchema,
    expectedSourceHeadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    operationId: z.string().regex(/^op_[a-zA-Z0-9_-]{8,}$/),
  })
  .strict();

export const CanvasSessionCapabilitySchema = z.enum(["read", "comment", "canvas:edit"]);

export const CanvasSessionRequestSchema = z
  .object({
    canvasId: CanvasIdSchema,
    requestedCapabilities: z.array(CanvasSessionCapabilitySchema).min(1),
  })
  .strict();

export const CanvasSessionResponseSchema = z
  .object({
    token: z.string().min(32),
    kid: z.string().min(8),
    alg: z.enum(["EdDSA", "ES256"]),
    issuer: z.string().min(1),
    audience: z.literal("collab"),
    expiresAt: z.string().datetime(),
    canvasId: CanvasIdSchema,
    capabilities: z.array(CanvasSessionCapabilitySchema),
    schemaVersion: z.literal(1),
    readOnly: z.boolean(),
  })
  .strict();

export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
export type EpisodeSummary = z.infer<typeof EpisodeSummarySchema>;
export type CopyEpisodePreview = z.infer<typeof CopyEpisodePreviewSchema>;
export type CanvasSessionCapability = z.infer<typeof CanvasSessionCapabilitySchema>;
