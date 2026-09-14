import { describe, expect, it } from "vitest";
import * as entry from "./index.js";

describe("packages/storage bootstrap", () => {
  it("imports the real public entry", () => {
    expect(Object.keys(entry).length).toBeGreaterThan(0);
  });
});
