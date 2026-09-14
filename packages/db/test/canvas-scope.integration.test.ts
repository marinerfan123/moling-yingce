import { describe, expect, it } from "vitest";

import { bootstrapCanvasScope } from "../src/canvas-scope.js";

describe("canvas scope bootstrap", () => {
  it("rejects stale session revisions and returns project scope for valid canvas sessions", async () => {
    await expect(
      bootstrapCanvasScope({
        canvasId: "canvas_12345678",
        tenantId: "tenant_12345678",
        projectId: "project_12345678",
        subject: "user_12345678",
        sessionRevision: 1,
        expectedSessionRevision: 2,
        requestId: "req_1",
      }),
    ).rejects.toThrow(/CANVAS_SESSION_REVISION_STALE/);
    await expect(
      bootstrapCanvasScope({
        canvasId: "canvas_12345678",
        tenantId: "tenant_12345678",
        projectId: "project_12345678",
        subject: "user_12345678",
        sessionRevision: 2,
        expectedSessionRevision: 2,
        requestId: "req_2",
      }),
    ).resolves.toMatchObject({ tenantId: "tenant_12345678", projectId: "project_12345678" });
  });
});
