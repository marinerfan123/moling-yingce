import { describe, expect, it } from "vitest";

import {
  CanvasSessionRequestSchema,
  CanvasSessionResponseSchema,
  ConfirmEpisodeCopyRequestSchema,
  CopyEpisodePreviewSchema,
  CreateProjectRequestSchema,
  EpisodeSummarySchema,
} from "./index.js";

const sha = `sha256:${"a".repeat(64)}`;

describe("project contracts", () => {
  it("validates commercial project bootstrap input and first episode summary", () => {
    expect(CreateProjectRequestSchema.parse({ title: "漫剧工作室" })).toEqual({
      title: "漫剧工作室",
      firstEpisodeTitle: "第 1 集",
    });
    expect(
      EpisodeSummarySchema.parse({
        id: "episode_12345678",
        projectId: "project_12345678",
        title: "第一幕",
        ordinal: 1,
        canvasId: "canvas_12345678",
        timelineId: "timeline_12345678",
        scriptId: "script_12345678",
      }),
    ).toMatchObject({ archivedAt: null });
  });

  it("freezes copy preview with source hash, deterministic remap and explicit exclusions", () => {
    const preview = CopyEpisodePreviewSchema.parse({
      previewId: "copyprev_12345678",
      sourceEpisodeId: "episode_12345678",
      sourceHeadHash: sha,
      policyHash: sha,
      copyPolicyVersion: 1,
      remap: { episode_12345678: "episode_87654321", script_12345678: "script_87654321" },
      excludedKinds: ["job", "approval", "comment", "audit"],
      reusableProjectRefs: ["asset:asset_12345678@version_1"],
    });
    expect(preview.remap.script_12345678).toBe("script_87654321");
    expect(() =>
      ConfirmEpisodeCopyRequestSchema.parse({
        previewId: preview.previewId,
        expectedSourceHeadHash: "bad",
        operationId: "op_12345678",
      }),
    ).toThrow();
  });

  it("limits canvas sessions to collab-only short scoped capabilities", () => {
    const request = CanvasSessionRequestSchema.parse({
      canvasId: "canvas_12345678",
      requestedCapabilities: ["read", "canvas:edit"],
    });
    expect(request.requestedCapabilities).toContain("canvas:edit");
    expect(
      CanvasSessionResponseSchema.parse({
        token: "x".repeat(64),
        kid: "kid_live_1",
        alg: "EdDSA",
        issuer: "comic-canvas:test",
        audience: "collab",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        canvasId: "canvas_12345678",
        capabilities: ["read"],
        schemaVersion: 1,
        readOnly: true,
      }),
    ).toMatchObject({ audience: "collab", readOnly: true });
  });
});
