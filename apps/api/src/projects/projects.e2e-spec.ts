import { describe, expect, it } from "vitest";

import { apiModules } from "../app.module.js";
import { ProjectsService } from "./projects.service.js";

describe("project lifecycle API boundary", () => {
  it("creates a project with owner membership and first episode/canvas/timeline/script", () => {
    const service = new ProjectsService();
    const created = service.createProject(
      { tenantId: "tenant_12345678", userId: "user_12345678" },
      { title: "商业漫剧" },
    );
    const principal = {
      tenantId: "tenant_12345678",
      userId: "user_12345678",
      memberships: [{ projectId: created.project.id, role: "Owner" as const, active: true }],
    };
    expect(service.listProjects(principal)).toHaveLength(1);
    expect(created.firstEpisode).toMatchObject({
      projectId: created.project.id,
      ordinal: 1,
      archivedAt: null,
    });
    expect(created.firstEpisode.canvasId).toMatch(/^canvas_/);
    expect(created.firstEpisode.timelineId).toMatch(/^timeline_/);
    expect(created.firstEpisode.scriptId).toMatch(/^script_/);
    expect(apiModules).toContain("ProjectsModule");
  });

  it("denies same-tenant users without project membership", () => {
    const service = new ProjectsService();
    const created = service.createProject(
      { tenantId: "tenant_12345678", userId: "user_owner001" },
      { title: "私有项目" },
    );
    expect(() =>
      service.assertProjectAccess(
        { tenantId: "tenant_12345678", userId: "user_other001", memberships: [] },
        created.project.id,
      ),
    ).toThrow(/PROJECT_MEMBERSHIP_MISSING/);
  });
});
