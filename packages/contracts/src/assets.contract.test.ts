import { describe, expect, it } from "vitest";

import { AssetVersionSchema, RemoteIngestInstructionSchema } from "./assets.js";

const sha256 = `sha256:${"a".repeat(64)}`;
const baseVersion = {
  id: "assetver_12345678",
  assetId: "asset_12345678",
  tenantId: "tenant_12345678",
  projectId: "project_12345678",
  sha256,
  byteSize: 12,
  detectedMime: "image/png",
  mediaMetadata: { width: 10, height: 10 },
  rightsRecordId: null,
  moderationRecordId: null,
  sourceJobId: null,
  status: "ready" as const,
  createdAt: new Date().toISOString(),
};

describe("asset contracts", () => {
  it("freezes immutable versions and rejects changed bytes, MIME, or hash", () => {
    const version = AssetVersionSchema.parse(baseVersion);
    expect(Object.isFrozen(version)).toBe(true);
    expect(Reflect.set(version, "byteSize", 13)).toBe(false);
    expect(Reflect.set(version, "detectedMime", "video/mp4")).toBe(false);
    expect(Reflect.set(version, "sha256", `sha256:${"b".repeat(64)}`)).toBe(false);
  });

  it("requires an opaque, project-scoped, short-lived remote instruction", () => {
    const instruction = RemoteIngestInstructionSchema.parse({
      id: "ingest_12345678",
      tenantId: "tenant_12345678",
      projectId: "project_12345678",
      locator: "https://example.com/a.png",
      declaredMime: "image/png",
      maxBytes: 10_000,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      requestSha256: sha256,
      state: "pending",
    });
    expect(instruction.projectId).toBe("project_12345678");
    expect(() => RemoteIngestInstructionSchema.parse({ ...instruction, locator: "file:///etc/passwd" })).toThrow();
  });
});
