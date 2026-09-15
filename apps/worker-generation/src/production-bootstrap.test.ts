import { describe, expect, it } from "vitest";

import { createProductionGenerationDependencies } from "./production-bootstrap.js";

describe("production generation bootstrap", () => {
  it("does not boot without an explicitly enabled reference runtime", () => {
    expect(() => createProductionGenerationDependencies({})).toThrow("GENERATION_PROVIDER_ADAPTER_REQUIRED");
  });

  it("uses an unsupported adapter and marks the worker as not ready", () => {
    const dependencies = createProductionGenerationDependencies({ COMIC_CANVAS_REFERENCE_RUNTIME: "true" });

    expect(dependencies.referenceOnly).toBe(true);
    expect(dependencies.adapter?.providerKey).toBe("reference");
  });
});
