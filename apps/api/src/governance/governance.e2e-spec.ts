import { describe, expect, it } from "vitest";

import { apiModules, apiSecurityPolicies } from "../app.module.js";
import { ApprovalGatePolicyService } from "./approval-gate-policy.service.js";
import { ModerationGateway } from "./moderation.gateway.js";
import { RightsService } from "./rights.service.js";
import { SafeFetchService } from "./safe-fetch.service.js";

const subject = { projectId: "project_12345678", kind: "provider_output", id: "asset_12345678", aiGenerated: true };
const principal = {
  tenantId: "tenant_12345678",
  userId: "user_12345678",
  memberships: [{ projectId: "project_12345678", active: true, capabilities: ["rights:manage"] }],
};

describe("governance API boundary", () => {
  it("blocks paid generation/export until rights, moderation and AI disclosure are complete", () => {
    const gates = new ApprovalGatePolicyService();
    const rights = new RightsService(gates);
    const moderation = new ModerationGateway(gates);
    expect(gates.evaluatePaidGenerationOrExport(subject)).toMatchObject({
      allow: false,
      reasons: ["RIGHTS_DECISION_REQUIRED", "MODERATION_DECISION_REQUIRED", "AI_DISCLOSURE_POLICY_REQUIRED"],
    });
    rights.appendRightsRecord(principal, subject, {
      owner: "creator",
      license: "commercial",
      evidenceSha256: `sha256:${"e".repeat(64)}`,
      decision: "approved",
      reason: "licensed",
    });
    moderation.recordDecision(subject, {
      stage: "output",
      evidenceSha256: `sha256:${"f".repeat(64)}`,
      decision: "approved",
    });
    gates.signDisclosurePolicy(subject.projectId);
    expect(gates.evaluatePaidGenerationOrExport(subject)).toEqual({
      allow: true,
      reasons: [],
      disclosureLabel: "本内容包含AI生成元素",
    });
  });

  it("denies no-membership rights edits, mandatory waivers and API-side network fetch", () => {
    const gates = new ApprovalGatePolicyService();
    const rights = new RightsService(gates);
    expect(() => rights.assertRightsManage({ ...principal, memberships: [] }, subject.projectId)).toThrow(
      /PROJECT_MEMBERSHIP_MISSING/,
    );
    expect(() => gates.assertWaiverAllowed("mandatory_ai_disclosure")).toThrow(/GOVERNANCE_WAIVER_NOT_ALLOWED/);
    const instruction = new SafeFetchService().validateRemoteIngestRequest({
      projectId: subject.projectId,
      url: "https://cdn.example.com/file.png",
      maxBytes: 1000,
    });
    expect(instruction.networkOpened).toBe(false);
    expect(apiModules).toContain("GovernanceModule");
    expect(apiSecurityPolicies.csrf).toBe("double-submit-cookie");
  });
});
