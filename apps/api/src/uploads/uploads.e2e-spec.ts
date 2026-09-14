import { describe, expect, it } from "vitest";
import { apiControllers, apiModules } from "../app.module.js";
import { RemoteIngestController } from "./remote-ingest.controller.js";
import { UploadsController } from "./uploads.controller.js";

const principal = {
  tenantId: "tenant_12345678",
  userId: "user_12345678",
  memberships: [{ projectId: "project_12345678", active: true, role: "Owner" }],
} as const;

describe("upload and remote ingest API", () => {
  it("registers upload, remote and asset endpoints", () => {
    expect(apiControllers).toEqual(
      expect.arrayContaining(["UploadsController", "RemoteIngestController", "AssetsController"]),
    );
    expect(apiModules).toEqual(expect.arrayContaining(["UploadsModule", "AssetsModule"]));
  });

  it("creates, completes idempotently and aborts a quarantined upload", () => {
    const controller = new UploadsController();
    const created = controller.create(principal, {
      projectId: principal.memberships[0].projectId,
      declaredMime: "image/png",
      declaredByteSize: 20,
      parts: 1,
    });
    expect(created.partUrls[0]?.url).toContain("upload.invalid");
    const completed = controller.complete(principal, created.uploadSession.id, {
      requestId: "req_12345678",
      parts: [{ etag: "x" }],
    }) as any;
    expect(completed.assetVersion.status).toBe("quarantined");
    expect(controller.complete(principal, created.uploadSession.id, { requestId: "req_12345678" })).toBe(completed);
    expect(completed.mediaTask.providerJobCreated).toBe(false);
  });

  it("returns an inspectable remote task without putting the URL in the queue payload", () => {
    const controller = new RemoteIngestController();
    const task = controller.create(principal, {
      projectId: "project_12345678",
      url: "https://example.invalid/a.png",
      declaredMime: "image/png",
      maxBytes: 100,
    });
    expect(task.instruction.locator).toBe("https://example.invalid/a.png");
    expect(task.mediaTask).not.toHaveProperty("url");
    expect(task.mediaTask.containsUrl).toBe(false);
  });

  it("denies a same-tenant user without project membership", () => {
    const controller = new UploadsController();
    expect(() =>
      controller.create(
        { ...principal, memberships: [] },
        { projectId: "project_12345678", declaredMime: "image/png", declaredByteSize: 1 },
      ),
    ).toThrow("PROJECT_MEMBERSHIP_MISSING");
  });
});
