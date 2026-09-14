import { describe, expect, it } from "vitest";
import {
  apiCapabilities,
  AuthorizationService,
  roleCapabilityMatrix,
  type Capability,
  type ProjectPolicy,
  type ProjectRole,
} from "./authorization.service.js";

const projectScope = { tenantId: "tenant_12345678", projectId: "project_12345678" };
const roles: readonly ProjectRole[] = ["Owner", "Editor", "Generator", "Commenter", "Viewer"];

function principal(
  role: ProjectRole,
  overrides: Partial<{ tenantId: string; projectId: string; active: boolean }> = {},
) {
  return {
    tenantId: overrides.tenantId ?? projectScope.tenantId,
    userId: "user_12345678",
    memberships: [
      {
        projectId: overrides.projectId ?? projectScope.projectId,
        role,
        active: overrides.active ?? true,
      },
    ],
  };
}

describe("AuthorizationService", () => {
  it("covers the 5 roles x 20 capabilities matrix", async () => {
    const service = new AuthorizationService();
    for (const role of roles) {
      for (const capability of apiCapabilities) {
        const decision = await service.authorize(principal(role), projectScope, capability);
        expect(decision.allow).toBe(roleCapabilityMatrix[role].includes(capability));
      }
    }
  });

  it("Owner has every capability", async () => {
    const service = new AuthorizationService();
    for (const capability of apiCapabilities) {
      await expect(service.authorize(principal("Owner"), projectScope, capability)).resolves.toMatchObject({
        allow: true,
      });
    }
  });

  it("does not let Generator inherit Editor or Commenter select assets", async () => {
    const service = new AuthorizationService();
    await expect(service.authorize(principal("Generator"), projectScope, "content:edit")).resolves.toMatchObject({
      allow: false,
    });
    await expect(service.authorize(principal("Commenter"), projectScope, "asset:select")).resolves.toMatchObject({
      allow: false,
    });
  });

  it("requires named project policy for Editor sensitive capabilities and Viewer export", async () => {
    const service = new AuthorizationService();
    const policy: ProjectPolicy = {
      revision: 7,
      roleCapabilities: {
        Editor: ["generation:spend", "asset:approve", "snapshot:restore", "rights:manage"],
        Viewer: ["export:create"],
      },
    };
    for (const capability of [
      "generation:spend",
      "asset:approve",
      "snapshot:restore",
      "rights:manage",
    ] satisfies Capability[]) {
      await expect(service.authorize(principal("Editor"), projectScope, capability)).resolves.toMatchObject({
        allow: false,
      });
      await expect(service.authorize(principal("Editor"), projectScope, capability, policy)).resolves.toMatchObject({
        allow: true,
        policyRevision: 7,
      });
    }
    await expect(service.authorize(principal("Viewer"), projectScope, "export:create")).resolves.toMatchObject({
      allow: false,
    });
    await expect(service.authorize(principal("Viewer"), projectScope, "export:create", policy)).resolves.toMatchObject({
      allow: true,
    });
  });

  it("denies same-tenant users without membership in this project for all capabilities", async () => {
    const service = new AuthorizationService();
    for (const capability of apiCapabilities) {
      await expect(
        service.authorize(principal("Owner", { projectId: "project_other123" }), projectScope, capability),
      ).resolves.toMatchObject({
        allow: false,
        reason: "PROJECT_MEMBERSHIP_MISSING",
      });
    }
  });
});
