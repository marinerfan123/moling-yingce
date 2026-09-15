import { describe, expect, it } from "vitest";

import { createProductionMediaDependencies } from "./production-bootstrap.js";

describe("production media bootstrap", () => {
  it("requires object storage configuration", () => {
    expect(() => createProductionMediaDependencies({})).toThrow("MEDIA_STORAGE_CONFIGURATION_REQUIRED");
  });

  it("creates a real S3 quarantine sink for the reference runtime", () => {
    const dependencies = createProductionMediaDependencies({
      S3_ENDPOINT: "http://minio:9000",
      S3_BUCKET: "comic-canvas",
      S3_ACCESS_KEY_ID: "minio",
      S3_SECRET_ACCESS_KEY: "minio-secret",
    });

    expect(dependencies.referenceOnly).toBe(true);
    expect(dependencies.receipts).toBeDefined();
    expect(dependencies.quarantineSink).toBeDefined();
  });
});
