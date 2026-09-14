import { describe, expect, it } from "vitest";
import { buildMediaHealth } from "./health.js";

describe("media worker health", () => {
  it("reports media runtime metadata", () => {
    expect(buildMediaHealth()).toMatchObject({
      status: "ok",
      service: "worker-media",
      readiness: "ready",
      ffmpeg: "7.1.1",
    });
  });
});
