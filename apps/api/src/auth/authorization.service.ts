export const apiCapabilities = [
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

export type Capability = (typeof apiCapabilities)[number];
export type ProjectRole = "Owner" | "Editor" | "Generator" | "Commenter" | "Viewer";
export type AuthorizationDecision = Readonly<
  | { allow: true; capability: Capability; policyRevision: number; reason: string }
  | { allow: false; capability: Capability; policyRevision?: number; reason: string }
>;

export type ProjectPolicy = Readonly<{
  revision: number;
  roleCapabilities?: Partial<Record<ProjectRole, readonly Capability[]>>;
}>;

export type ProjectMembership = Readonly<{
  projectId: string;
  role: ProjectRole;
  active: boolean;
}>;

export type PrincipalForAuthorization = Readonly<{
  tenantId: string;
  userId: string;
  memberships: readonly ProjectMembership[];
}>;

const ownerCapabilities: readonly Capability[] = [
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
];

const baseRoleCapabilities: Record<ProjectRole, readonly Capability[]> = {
  Owner: ownerCapabilities,
  Editor: [
    "project:view",
    "content:edit",
    "canvas:edit",
    "asset:upload",
    "asset:select",
    "timeline:edit",
    "snapshot:create",
    "comment:create",
    "issue:manage",
  ],
  Generator: ["project:view", "generation:spend", "asset:upload", "job:cancel-own", "comment:create"],
  Commenter: ["project:view", "comment:create"],
  Viewer: ["project:view"],
};

export class AuthorizationService {
  async authorize(
    principal: PrincipalForAuthorization,
    projectScope: { tenantId: string; projectId: string },
    capability: Capability,
    projectPolicy: ProjectPolicy = { revision: 0 },
  ): Promise<AuthorizationDecision> {
    if (principal.tenantId !== projectScope.tenantId) {
      return { allow: false, capability, reason: "TENANT_MISMATCH" };
    }
    const membership = principal.memberships.find((item) => item.projectId === projectScope.projectId && item.active);
    if (!membership) {
      return { allow: false, capability, reason: "PROJECT_MEMBERSHIP_MISSING" };
    }

    const policyCapabilities = projectPolicy.roleCapabilities?.[membership.role] ?? [];
    const allowed = new Set([...baseRoleCapabilities[membership.role], ...policyCapabilities]);
    if (!allowed.has(capability)) {
      return {
        allow: false,
        capability,
        policyRevision: projectPolicy.revision,
        reason: `CAPABILITY_DENIED:${membership.role}`,
      };
    }
    return {
      allow: true,
      capability,
      policyRevision: projectPolicy.revision,
      reason: `CAPABILITY_ALLOWED:${membership.role}`,
    };
  }
}

export const roleCapabilityMatrix = baseRoleCapabilities;
