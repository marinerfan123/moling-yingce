import { describe, expect, it } from "vitest";

import { FakeProviderAdapter } from "./adapters/fake.adapter.js";
import { productionProviderAdapters } from "./adapter-registry.js";
import { assertGenerationWorkerEnvironment } from "./main.js";

describe("generation provider adapter registry", () => {
  it("does not import Fake into the production registry", () => {
    expect(productionProviderAdapters()).toEqual([]);
    expect(productionProviderAdapters().some((adapter) => adapter.providerKey === "fake")).toBe(false);
  });

  it("keeps Fake available only for test wiring", async () => {
    const fake = new FakeProviderAdapter();
    await expect(fake.listModels({})).resolves.toHaveLength(1);
    expect(productionProviderAdapters()).not.toContain(fake);
  });

  it("rejects Fake enablement in production startup environment", () => {
    expect(() =>
      assertGenerationWorkerEnvironment({ NODE_ENV: "production", COMIC_CANVAS_ENABLE_FAKE_PROVIDER: "true" }),
    ).toThrow("FAKE_PROVIDER_FORBIDDEN_IN_PRODUCTION");
  });
});
