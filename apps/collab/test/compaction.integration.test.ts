import { describe, expect, it } from "vitest";

import { canFinalizeProjection } from "../src/compactor.js";

describe("projection finalization", () => {
  it("requires marker, terminal source outbox, watermark and non-dead-letter state", () => {
    expect(
      canFinalizeProjection({
        markerDurable: true,
        sourceOutboxTerminal: true,
        consumerWatermarkAtLeastSeq: true,
        deadLetter: false,
      }),
    ).toBe(true);
    expect(
      canFinalizeProjection({
        markerDurable: true,
        sourceOutboxTerminal: true,
        consumerWatermarkAtLeastSeq: true,
        deadLetter: true,
      }),
    ).toBe(false);
  });
});
