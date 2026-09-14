import { describe, expect, it } from "vitest";

import { opaqueObjectKey, quarantineObjectKey } from "./object-key.js";
import { buildQuarantineToReadyPromotion, redactStorageDiagnostic } from "./quarantine.js";
import { canSignObject, signReadyObjectUrl } from "./signed-url.js";

describe("asset storage access policy", () => {
  it("uses opaque tenant-scoped keys without titles or original filenames", () => {
    const key = opaqueObjectKey("tenant_12345678", "object_12345678", "ready");
    expect(key).toContain("tenant_12345678");
    expect(key).not.toMatch(/title|original|filename|\.png|\.mp4/i);
    expect(key).not.toMatch(/https?:\/\//i);
  });

  it("never signs quarantine keys for browser/CDN access", () => {
    const quarantineKey = opaqueObjectKey("tenant_12345678", "object_12345678", "quarantine");
    expect(() => signReadyObjectUrl({ tenantId: "tenant_12345678", objectKey: quarantineKey })).toThrow(
      "STORAGE_QUARANTINE_ACCESS_DENIED",
    );
    expect(canSignObject({ tenantId: "tenant_12345678", key: quarantineKey, audience: "browser" })).toBe(false);
    expect(canSignObject({ tenantId: "tenant_12345678", key: quarantineKey, audience: "cdn" })).toBe(false);
  });

  it("signs ready keys for their tenant and rejects cross-tenant access", () => {
    const readyKey = opaqueObjectKey("tenant_12345678", "object_12345678", "ready");
    expect(signReadyObjectUrl({ tenantId: "tenant_12345678", objectKey: readyKey }).url).toMatch(/^https:\/\//);
    expect(() => signReadyObjectUrl({ tenantId: "tenant_other", objectKey: readyKey })).toThrow(
      "STORAGE_CROSS_TENANT_ACCESS_DENIED",
    );
  });

  it("describes quarantine-to-ready promotion as server-side immutable CAS copy", () => {
    const promotion = buildQuarantineToReadyPromotion({
      tenantId: "tenant_12345678",
      objectId: "object_12345678",
      variant: "thumbnail",
      quarantineKey: quarantineObjectKey("tenant_12345678", "object_12345678", "uploadver_12345678"),
      expectedQuarantineVersion: "uploadver_12345678",
      checksumSha256: "a".repeat(64),
    });

    expect(promotion).toMatchObject({
      operation: "server-side-copy",
      immutable: true,
      compareAndSwap: { expectedSourceVersion: "uploadver_12345678" },
    });
    expect(promotion.destinationKey).toBe("tenants/tenant_12345678/objects/object_12345678/variants/thumbnail");
    expect(() =>
      buildQuarantineToReadyPromotion({
        tenantId: "tenant_12345678",
        objectId: "object_12345678",
        variant: "thumbnail",
        quarantineKey: quarantineObjectKey("tenant_12345678", "object_12345678", "otherver_12345678"),
        expectedQuarantineVersion: "uploadver_12345678",
        checksumSha256: "a".repeat(64),
      }),
    ).toThrow("STORAGE_QUARANTINE_VERSION_MISMATCH");
  });

  it("redacts remote locators and original filenames from diagnostics", () => {
    expect(
      redactStorageDiagnostic({
        locator: "https://example.com/private/source.png",
        originalFilename: "secret-scene.png",
        message: "failed to fetch https://example.com/private/source.png from C:/tmp/secret-scene.png",
      }),
    ).toEqual({
      locator: "[redacted]",
      originalFilename: "[redacted]",
      message: "failed to fetch [redacted-url] from C:/tmp/[redacted-file]",
    });
  });
});
