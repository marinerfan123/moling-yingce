import { describe, expect, it } from "vitest";
import { migrate } from "./migrate.js";

describe("migrate", () => {
  it("no-ops on an empty Task 01 migration directory", async () => {
    await expect(migrate()).resolves.toEqual({ applied: 0 });
  });
});
