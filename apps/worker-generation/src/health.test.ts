import { describe, expect, it } from "vitest";
import { buildGenerationHealth } from "./health.js";

describe("generation worker health", () => {
  it("reports readiness and adapter count", () => {
    expect(buildGenerationHealth("ready")).toMatchObject({
      status: "ok",
      service: "worker-generation",
      readiness: "ready",
      adapters: 0,
    });
  });
});
