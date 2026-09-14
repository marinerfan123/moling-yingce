import { describe, expect, it } from "vitest";

import { canInteractWithCanvasAndDock, composerMetrics, computeWorkRect } from "./work-rect.js";

describe("work rect", () => {
  it("computes deterministic workspace bounds", () => {
    expect(
      computeWorkRect({ viewportWidth: 1440, viewportHeight: 900, leftDockWidth: 280, rightDockWidth: 352 }),
    ).toEqual({
      x: 332,
      y: 52,
      width: 756,
      height: 792,
    });
    expect(
      canInteractWithCanvasAndDock(
        computeWorkRect({ viewportWidth: 1440, viewportHeight: 900, leftDockWidth: 280, rightDockWidth: 352 }),
      ),
    ).toBe(true);
    expect(
      canInteractWithCanvasAndDock(
        computeWorkRect({ viewportWidth: 1024, viewportHeight: 768, leftDockWidth: 0, rightDockWidth: 320 }),
      ),
    ).toBe(true);
  });

  it("calculates composer constraints", () => {
    const rect = computeWorkRect({ viewportWidth: 1280, viewportHeight: 720, rightDockWidth: 320 });
    expect(composerMetrics(rect, { viewportHeight: 720 })).toMatchObject({
      width: 840,
      expandedMaxHeight: 156,
      fullScreen: false,
    });
    expect(composerMetrics({ ...rect, height: 120 }, { viewportHeight: 560 })).toMatchObject({ fullScreen: true });
  });
});
