import { describe, expect, it } from "vitest";

import { CanvasDocumentReader } from "./canvas-reader.client.js";

describe("CanvasDocumentReader", () => {
  it("reads only durable collab revisions by canvas and document epoch", () => {
    const reader = new CanvasDocumentReader();
    reader.registerRevision({
      canvasId: "canvas_12345678",
      documentEpoch: 1,
      durableSeq: 2,
      updateHash: `sha256:${"a".repeat(64)}`,
      stateVector: "sv",
    });
    expect(
      reader.readDurableRevision({ canvasId: "canvas_12345678", documentEpoch: 1, serviceIdentity: "api" }),
    ).toMatchObject({
      durableSeq: 2,
    });
    expect(() =>
      reader.readDurableRevision({ canvasId: "canvas_12345678", documentEpoch: 2, serviceIdentity: "api" }),
    ).toThrow(/CANVAS_DURABLE_REVISION_MISSING/);
  });
});
