import { describe, expect, it } from "vitest";
import { HealthController } from "../src/health.controller.js";

describe("API health", () => {
  it("returns the readiness-aware health contract", () => {
    expect(new HealthController("test").getHealth()).toEqual({
      status: "ok",
      service: "api",
      version: "test",
      readiness: "ready",
    });
  });
});
