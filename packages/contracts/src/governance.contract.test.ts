import { describe, expect, it } from "vitest";

import {
  AiDisclosurePolicySchema,
  ApprovalGatePolicySchema,
  GovernanceWaiverSchema,
  ModerationRecordSchema,
  RemoteIngestRequestSchema,
  RightsRecordSchema,
} from "./index.js";

const sha = `sha256:${"c".repeat(64)}`;
const subject = { kind: "provider_output", id: "asset_12345678", projectId: "project_12345678" } as const;

describe("governance contracts", () => {
  it("validates immutable rights and moderation decisions with evidence hashes", () => {
    expect(
      RightsRecordSchema.parse({
        id: "rights_12345678",
        tenantId: "tenant_12345678",
        projectId: "project_12345678",
        subject,
        version: 1,
        owner: "创作者",
        license: "commercial",
        territory: ["CN"],
        expiresAt: null,
        evidence: { sha256: sha, collectedAt: new Date().toISOString() },
        decision: "approved",
        reason: "rights evidence recorded",
        actorUserId: "user_12345678",
        createdAt: new Date().toISOString(),
      }),
    ).toMatchObject({ version: 1, decision: "approved" });
    expect(
      ModerationRecordSchema.parse({
        id: "mod_12345678",
        tenantId: "tenant_12345678",
        projectId: "project_12345678",
        subject,
        version: 1,
        stage: "output",
        checker: "manual-review",
        evidenceSha256: sha,
        decision: "approved",
        reason: "safe for preview",
        actorUserId: "user_12345678",
        createdAt: new Date().toISOString(),
      }).stage,
    ).toBe("output");
  });

  it("requires signed non-waivable AI disclosure policy", () => {
    const disclosure = AiDisclosurePolicySchema.parse({
      id: "disclosure_12345678",
      targetProfile: "cn-short-video",
      version: 1,
      visibleOverlay: true,
      machineReadableMetadata: true,
      sidecar: true,
      labelText: "本内容包含AI生成元素",
      fontVersionId: "font_licensed_v1",
      placement: "bottom-right",
      timeRange: { startMs: 0, endMs: 3000 },
      signed: true,
    });
    expect(
      ApprovalGatePolicySchema.parse({
        id: "gatepolicy_12345678",
        projectId: "project_12345678",
        version: 1,
        requireRights: true,
        requireModeration: true,
        requireAiDisclosure: true,
        disclosurePolicyId: disclosure.id,
        signed: true,
      }).requireAiDisclosure,
    ).toBe(true);
    expect(() =>
      GovernanceWaiverSchema.parse({
        id: "waiver_12345678",
        projectId: "project_12345678",
        subject,
        waivedRequirement: "mandatory_ai_disclosure",
        reason: "not allowed",
        actorUserId: "user_12345678",
        createdAt: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it("validates remote ingest request without authorizing network I/O", () => {
    expect(
      RemoteIngestRequestSchema.parse({
        projectId: "project_12345678",
        url: "https://example.com/input.png",
        expectedSha256: sha,
        maxBytes: 10_000_000,
      }).url,
    ).toBe("https://example.com/input.png");
    expect(() =>
      RemoteIngestRequestSchema.parse({ projectId: "project_12345678", url: "file:///etc/passwd", maxBytes: 1 }),
    ).toThrow();
  });
});
