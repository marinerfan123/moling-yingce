import { opaqueObjectKey, quarantineObjectKey } from "./object-key.js";

export type PromotionRequest = Readonly<{
  tenantId: string;
  objectId: string;
  variant: string;
  quarantineKey: string;
  expectedQuarantineVersion: string;
  checksumSha256: string;
}>;

export type PromotionContract = Readonly<{
  operation: "server-side-copy";
  sourceKey: string;
  sourceVersion: string;
  destinationKey: string;
  checksumSha256: string;
  immutable: true;
  compareAndSwap: Readonly<{ expectedSourceVersion: string }>;
}>;

export function buildQuarantineToReadyPromotion(request: PromotionRequest): PromotionContract {
  const expected = quarantineObjectKey(request.tenantId, request.objectId, request.expectedQuarantineVersion);
  if (request.quarantineKey !== expected) throw new Error("STORAGE_QUARANTINE_VERSION_MISMATCH");
  if (!/^[a-f0-9]{64}$/i.test(request.checksumSha256)) throw new Error("STORAGE_CHECKSUM_INVALID");
  return {
    operation: "server-side-copy",
    sourceKey: request.quarantineKey,
    sourceVersion: request.expectedQuarantineVersion,
    destinationKey: opaqueObjectKey(request.tenantId, request.objectId, request.variant),
    checksumSha256: request.checksumSha256.toLowerCase(),
    immutable: true,
    compareAndSwap: { expectedSourceVersion: request.expectedQuarantineVersion },
  };
}

/** Diagnostics may retain safe codes and IDs, but never remote locators or filenames. */
export function redactStorageDiagnostic(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/https?:\/\/[^\s]+/gi, "[redacted-url]")
      .replace(/(^|[\\/])[^\\/\s]*\.[A-Za-z0-9]{1,8}(?=$|[\s?#])/g, "$1[redacted-file]");
  }
  if (Array.isArray(value)) return value.map(redactStorageDiagnostic);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const lower = key.toLowerCase();
        return [
          key,
          lower.includes("url") || lower.includes("locator") || lower.includes("filename")
            ? "[redacted]"
            : redactStorageDiagnostic(item),
        ];
      }),
    );
  }
  return value;
}
