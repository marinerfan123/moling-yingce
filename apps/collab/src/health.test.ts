import { describe, expect, it } from "vitest";
import { buildCollabHealth } from "./health.js";

describe("collab health", () => {
  it("reports the shared health contract", () => {
    expect(buildCollabHealth("not_ready")).toMatchObject({
      status: "ok",
      service: "collab",
      readiness: "not_ready",
    });
  });
});
