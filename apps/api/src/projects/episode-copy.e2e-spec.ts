import { describe, expect, it } from "vitest";

import { assertEveryEpisodeTableCataloged, episodeCopyPolicyCatalog } from "./episode-copy-matrix.js";
import { EpisodeLifecycleRegistry } from "./episode-lifecycle.registry.js";
import { ProjectsService } from "./projects.service.js";

const principalFor = (projectId: string) => ({
  tenantId: "tenant_12345678",
  userId: "user_12345678",
  memberships: [{ projectId, role: "Owner" as const, active: true }],
});

describe("episode copy and archive lifecycle", () => {
  it("requires explicit copy policy catalog and remaps episode-local ids only", () => {
    const service = new ProjectsService();
    const created = service.createProject(
      { tenantId: "tenant_12345678", userId: "user_12345678" },
      { title: "复制测试" },
    );
    const principal = principalFor(created.project.id);
    const preview = service.previewEpisodeCopy(principal, created.firstEpisode.id, "op_12345678");
    expect(preview.remap[created.firstEpisode.scriptId]).toMatch(/^script_/);
    expect(preview.excludedKinds).toContain("jobs");
    const confirmed = service.confirmEpisodeCopy(principal, {
      previewId: preview.previewId,
      expectedSourceHeadHash: preview.sourceHeadHash,
      operationId: "op_22345678",
    });
    expect(confirmed.episode.id).not.toBe(created.firstEpisode.id);
    expect(confirmed.excludedKinds).toContain("audit_events");
  });

  it("fails closed for uncataloged tables, source-head drift and active archive blockers", () => {
    expect(() =>
      assertEveryEpisodeTableCataloged([
        ...episodeCopyPolicyCatalog.map((row) => row.tableName),
        "unknown_future_table",
      ]),
    ).toThrow(/EPISODE_COPY_POLICY_MISSING/);
    const registry = new EpisodeLifecycleRegistry();
    registry.addArchiveBlocker("episode_12345678", {
      id: "blocker_1",
      kind: "running_job",
      ref: "job_1",
      terminal: false,
    });
    expect(() => registry.assertCanArchive("episode_12345678")).toThrow(/EPISODE_ARCHIVE_BLOCKED/);
    const service = new ProjectsService();
    const created = service.createProject(
      { tenantId: "tenant_12345678", userId: "user_12345678" },
      { title: "漂移测试" },
    );
    const principal = principalFor(created.project.id);
    const preview = service.previewEpisodeCopy(principal, created.firstEpisode.id, "op_32345678");
    expect(() =>
      service.confirmEpisodeCopy(principal, {
        previewId: preview.previewId,
        expectedSourceHeadHash: `sha256:${"0".repeat(64)}`,
        operationId: "op_42345678",
      }),
    ).toThrow(/EPISODE_COPY_SOURCE_CHANGED/);
  });
});
