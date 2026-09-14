import { describe, expect, it } from "vitest";
import { assertDispatcherEnvironment } from "./dispatcher-main.js";

describe("dispatcher main", () => {
  it("fails startup when API/provider/KMS credentials are present", () => {
    expect(assertDispatcherEnvironment({ REDIS_URL: "redis://local" })).toBe(true);
    expect(() => assertDispatcherEnvironment({ GENERATION_SUBMIT_KMS_KEY_ID: "kms" })).toThrow(/FORBIDDEN_CREDENTIALS/);
  });
});
