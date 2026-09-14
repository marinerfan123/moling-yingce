import { describe, expect, it } from "vitest";

import { SelectionsController } from "./selections.controller.js";

const principal = {
  tenantId: "tenant_12345678",
  userId: "user_12345678",
  memberships: [{ projectId: "project_12345678", active: true, role: "Editor" }],
} as const;

describe("selections API", () => {
  it("appends ready output selections and moves only the current pointer", () => {
    const controller = new SelectionsController();
    const first = controller.append(principal, {
      projectId: "project_12345678",
      shotNodeId: "node_shot12345678",
      assetVersionId: "assetver_12345678",
      sourceJobId: "job_12345678",
      outputState: "ready",
      inputSnapshotHash: `sha256:${"a".repeat(64)}`,
    });
    const second = controller.append(principal, {
      projectId: "project_12345678",
      shotNodeId: "node_shot12345678",
      assetVersionId: "assetver_87654321",
      sourceJobId: "job_87654321",
      outputState: "ready",
      inputSnapshotHash: `sha256:${"b".repeat(64)}`,
    });

    expect(second.record).toMatchObject({
      supersedesSelectionId: first.record.id,
      approvalState: "not_approval",
    });
    expect(controller.current(principal, "project_12345678", "node_shot12345678")).toMatchObject({
      currentSelectionId: second.record.id,
      assetVersionId: "assetver_87654321",
    });
  });

  it("rejects quarantine outputs and non-members without creating approval state", () => {
    const controller = new SelectionsController();
    expect(() =>
      controller.append(principal, {
        projectId: "project_12345678",
        shotNodeId: "node_shot12345678",
        assetVersionId: "assetver_12345678",
        sourceJobId: "job_12345678",
        outputState: "quarantine",
        inputSnapshotHash: `sha256:${"a".repeat(64)}`,
      }),
    ).toThrow("SELECTION_OUTPUT_NOT_READY");
    expect(() =>
      controller.append(
        { ...principal, memberships: [] },
        {
          projectId: "project_12345678",
          shotNodeId: "node_shot12345678",
          assetVersionId: "assetver_12345678",
          sourceJobId: "job_12345678",
          outputState: "ready",
          inputSnapshotHash: `sha256:${"a".repeat(64)}`,
        },
      ),
    ).toThrow("PROJECT_MEMBERSHIP_MISSING");
  });
});
