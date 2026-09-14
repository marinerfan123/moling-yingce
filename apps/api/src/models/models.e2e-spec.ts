import { describe, expect, it } from "vitest";

import { apiControllers, apiModules } from "../app.module.js";
import { ModelsController } from "./models.controller.js";

const principal = {
  tenantId: "tenant_12345678",
  userId: "user_12345678",
  memberships: [{ projectId: "project_12345678", active: true, role: "Owner" }],
} as const;

describe("model catalog API", () => {
  it("registers model catalog module and controller", () => {
    expect(apiControllers).toContain("ModelsController");
    expect(apiModules).toContain("ModelsModule");
  });

  it("returns enabled provider models for a project member without exposing credentials", () => {
    const response = new ModelsController().list(principal, "project_12345678", { capability: "image" });
    expect(response.models).toHaveLength(1);
    expect(response.models[0]).toMatchObject({
      providerKey: "system-catalog",
      modelKey: "system-catalog/commercial-canvas",
      capabilities: ["text", "image", "video", "tts"],
      recoveryMode: "unsupported",
    });
    expect(JSON.stringify(response)).not.toMatch(/secret|token|sk-|authorization/i);
  });

  it("denies access without project membership", () => {
    expect(() => new ModelsController().list({ ...principal, memberships: [] }, "project_12345678")).toThrow(
      "PROJECT_MEMBERSHIP_MISSING",
    );
  });
});
