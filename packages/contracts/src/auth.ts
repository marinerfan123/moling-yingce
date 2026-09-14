import { z } from "zod";

import { ProjectIdSchema, TenantIdSchema, UserIdSchema } from "./ids.js";

export const capabilities = [
  "project:view",
  "content:edit",
  "canvas:edit",
  "generation:spend",
  "asset:upload",
  "asset:select",
  "asset:approve",
  "timeline:edit",
  "snapshot:create",
  "snapshot:restore",
  "job:cancel-own",
  "job:cancel-any",
  "comment:create",
  "issue:manage",
  "share:manage",
  "export:create",
  "stale:waive",
  "rights:manage",
  "retention:manage",
  "project:admin",
] as const;

export const CapabilitySchema = z.enum(capabilities);
export type Capability = z.infer<typeof CapabilitySchema>;

export const PrincipalSchema = z.object({
  tenantId: TenantIdSchema,
  userId: UserIdSchema,
  projectIds: z.array(ProjectIdSchema).default([]),
  capabilities: z.array(CapabilitySchema),
});

export type Principal = z.infer<typeof PrincipalSchema>;

export const ProjectRoleSchema = z.enum(["Owner", "Editor", "Generator", "Commenter", "Viewer"]);
export type ProjectRole = z.infer<typeof ProjectRoleSchema>;

export const AuthorizationDecisionSchema = z.discriminatedUnion("allow", [
  z.object({
    allow: z.literal(true),
    capability: CapabilitySchema,
    policyRevision: z.number().int().nonnegative(),
    reason: z.string().min(1),
  }),
  z.object({
    allow: z.literal(false),
    capability: CapabilitySchema,
    policyRevision: z.number().int().nonnegative().optional(),
    reason: z.string().min(1),
  }),
]);

export type AuthorizationDecision = z.infer<typeof AuthorizationDecisionSchema>;
