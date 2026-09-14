import { describe, expect, it } from "vitest";

import { documentToScreen, screenToDocument } from "./coordinates.js";

describe("coordinate conversions", () => {
  it("round-trips random document/screen coordinates within 0.01px", () => {
    for (let i = 0; i < 1000; i += 1) {
      const point = { x: i * 13.37 - 5000, y: i * -7.91 + 3000 };
      const viewport = { x: (i % 97) - 48, y: (i % 53) - 26, zoom: 0.1 + (i % 20) / 4 };
      const roundTrip = screenToDocument(documentToScreen(point, viewport), viewport);
      expect(Math.abs(roundTrip.x - point.x)).toBeLessThan(0.01);
      expect(Math.abs(roundTrip.y - point.y)).toBeLessThan(0.01);
    }
  });
});
