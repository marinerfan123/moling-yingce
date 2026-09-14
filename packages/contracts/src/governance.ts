import { z } from "zod";

import { ProjectIdSchema, TenantIdSchema, UserIdSchema } from "./ids.js";

const opaqueId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-zA-Z0-9][a-zA-Z0-9_-]{7,}$`), `${prefix} id must be opaque and prefixed`);

export const RightsRecordIdSchema = opaqueId("rights");
export const ModerationRecordIdSchema = opaqueId("mod");
export const ApprovalGatePolicyIdSchema = opaqueId("gatepolicy");
export const AiDisclosurePolicyIdSchema = opaqueId("disclosure");
export const WaiverIdSchema = opaqueId("waiver");

export const GovernanceSubjectSchema = z
  .object({
    kind: z.enum(["project", "asset", "font", "music", "sfx", "provider_output"]),
    id: z.string().min(1),
    projectId: ProjectIdSchema,
  })
  .strict();

export const RightsDecisionSchema = z.enum(["approved", "restricted", "rejected", "expired"]);
export const ModerationDecisionSchema = z.enum(["approved", "needs_review", "rejected"]);

const EvidenceSchema = z
  .object({
    sourceUrl: z.string().url().optional(),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    collectedAt: z.string().datetime(),
  })
  .strict();

export const RightsRecordSchema = z
  .object({
    id: RightsRecordIdSchema,
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    subject: GovernanceSubjectSchema,
    version: z.number().int().min(1),
    owner: z.string().trim().min(1),
    license: z.string().trim().min(1),
    territory: z.array(z.string().min(2)).min(1),
    expiresAt: z.string().datetime().nullable(),
    evidence: EvidenceSchema,
    decision: RightsDecisionSchema,
    reason: z.string().trim().min(1),
    actorUserId: UserIdSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export const ModerationRecordSchema = z
  .object({
    id: ModerationRecordIdSchema,
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    subject: GovernanceSubjectSchema,
    version: z.number().int().min(1),
    stage: z.enum(["input", "output"]),
    checker: z.string().trim().min(1),
    evidenceSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    decision: ModerationDecisionSchema,
    reason: z.string().trim().min(1),
    actorUserId: UserIdSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export const AiDisclosurePolicySchema = z
  .object({
    id: AiDisclosurePolicyIdSchema,
    targetProfile: z.enum(["cn-short-video", "web-preview", "internal-review"]),
    version: z.number().int().min(1),
    visibleOverlay: z.boolean(),
    machineReadableMetadata: z.boolean(),
    sidecar: z.boolean(),
    labelText: z.literal("本内容包含AI生成元素"),
    fontVersionId: z.string().min(1),
    placement: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]),
    timeRange: z.object({ startMs: z.number().int().min(0), endMs: z.number().int().positive() }).strict(),
    signed: z.literal(true),
  })
  .strict()
  .superRefine((policy, ctx) => {
    if (policy.timeRange.endMs <= policy.timeRange.startMs) {
      ctx.addIssue({ code: "custom", path: ["timeRange"], message: "disclosure timeRange must be positive" });
    }
  });

export const ApprovalGatePolicySchema = z
  .object({
    id: ApprovalGatePolicyIdSchema,
    projectId: ProjectIdSchema,
    version: z.number().int().min(1),
    requireRights: z.literal(true),
    requireModeration: z.literal(true),
    requireAiDisclosure: z.literal(true),
    disclosurePolicyId: AiDisclosurePolicyIdSchema,
    signed: z.literal(true),
  })
  .strict();

export const GovernanceWaiverSchema = z
  .object({
    id: WaiverIdSchema,
    projectId: ProjectIdSchema,
    subject: GovernanceSubjectSchema,
    waivedRequirement: z.enum(["editorial_review", "optional_brand_review"]),
    reason: z.string().min(1),
    actorUserId: UserIdSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export const RemoteIngestRequestSchema = z
  .object({
    projectId: ProjectIdSchema,
    url: z.string().url().startsWith("https://"),
    expectedSha256: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .optional(),
    maxBytes: z.number().int().positive().max(500_000_000),
  })
  .strict();

export type RightsRecord = z.infer<typeof RightsRecordSchema>;
export type ModerationRecord = z.infer<typeof ModerationRecordSchema>;
export type AiDisclosurePolicy = z.infer<typeof AiDisclosurePolicySchema>;
export type ApprovalGatePolicy = z.infer<typeof ApprovalGatePolicySchema>;
