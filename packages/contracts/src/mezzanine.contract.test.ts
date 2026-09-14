import { describe, expect, it } from "vitest";

import { MezzanineRecipeSchema, assertMezzanineVariant, isTimelineEligibleVideo } from "./assets.js";

const valid = {
  assetVersionId: "assetver_12345678",
  assetVariantId: "assetvar_12345678",
  objectVersionId: "objv_opaque-version-1",
  byteSha256: `sha256:${"a".repeat(64)}`,
  recipe: {
    codec: "H.264",
    pixelFormat: "yuv420p",
    frameRateNumerator: 25,
    frameRateDenominator: 1,
    constantFrameRate: true,
  },
  sourceToFrame: [{ sourceFrame: 0, mezzanineFrame: 0 }],
  timelineEligible: true,
};

describe("CFR mezzanine contract", () => {
  it("requires the exact editing recipe and immutable object evidence", () => {
    expect(MezzanineRecipeSchema.parse(valid.recipe)).toEqual(valid.recipe);
    expect(assertMezzanineVariant(valid)).toMatchObject({
      objectVersionId: valid.objectVersionId,
      byteSha256: valid.byteSha256,
    });
  });

  it("keeps a ready video timeline-ineligible until mezzanine evidence exists", () => {
    expect(isTimelineEligibleVideo({ ...valid, timelineEligible: false })).toBe(false);
    expect(isTimelineEligibleVideo({ ...valid, recipe: { ...valid.recipe, frameRateNumerator: 24 } })).toBe(false);
    expect(isTimelineEligibleVideo(valid)).toBe(true);
  });
});
