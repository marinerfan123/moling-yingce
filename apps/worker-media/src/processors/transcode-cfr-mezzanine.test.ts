import { describe, expect, it } from "vitest";
import { transcodeCfrMezzanine } from "./transcode-cfr-mezzanine.js";
describe("CFR mezzanine", () => {
  it("uses immutable 25/1 recipe", () => {
    const result = transcodeCfrMezzanine(
      { sourceObjectKey: "quarantine/x", objectVersionId: "v1", sourceFrameCount: 30 },
      { eventId: "evt_1" },
    );
    expect(result.recipe).toEqual({ codec: "h264", pixelFormat: "yuv420p", frameRate: "25/1", cfr: true });
    expect(result.stableHash).toContain("25/1");
  });
});
