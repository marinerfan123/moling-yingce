import { describe, expect, it } from "vitest";

import { createProductionApiDependencies } from "./production-bootstrap.js";

describe("production API bootstrap", () => {
  it("requires an OIDC issuer before starting the public API", () => {
    expect(() => createProductionApiDependencies({})).toThrow("API_OIDC_ISSUER_REQUIRED");
  });

  it("returns an explicit reference profile with project and template boundaries", () => {
    const dependencies = createProductionApiDependencies({
      OIDC_ISSUER: "https://issuer.test",
      OIDC_AUDIENCE: "comic-api",
    });

    expect(dependencies.runtimeProfile).toBe("reference");
    expect(dependencies.projectsController).toBeDefined();
    expect(dependencies.templatesController?.list()).toHaveLength(1);
    expect(dependencies.providerWebhook).toBeDefined();
  });
});
