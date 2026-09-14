import { describe, expect, it } from "vitest";

import { assertApiProductionDependencies } from "./main.js";

describe("API production composition", () => {
  it("fails fast without webhook route, KMS secret, replay and verified-event ports", () => {
    expect(() => assertApiProductionDependencies({})).toThrow("API_WEBHOOK_DEPENDENCIES_REQUIRED");
  });
});
