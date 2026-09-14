export type UntrustedSource = Readonly<{
  kind: "upload" | "remote" | "provider";
  tenantId: string;
  objectId: string;
  byteSize: number;
  detectedMime: string;
  sha256: string;
  width?: number;
  height?: number;
  durationMs?: number;
  locator?: string;
}>;

export type QuarantinedObject = Readonly<{
  objectId: string;
  tenantId: string;
  quarantine: true;
  byteSize: number;
  detectedMime: string;
  sha256: string;
  sourceKind: UntrustedSource["kind"];
  mediaMetadata: Readonly<{ width?: number; height?: number; durationMs?: number }>;
}>;

export type IngestLimits = Readonly<{
  maxBytes?: number;
  maxPixels?: number;
  maxDurationMs?: number;
  allowedMime?: readonly string[];
}>;

const DEFAULT_LIMITS: Required<IngestLimits> = {
  maxBytes: 500_000_000,
  maxPixels: 120_000_000,
  maxDurationMs: 60 * 60 * 1000,
  allowedMime: ["image/png", "image/jpeg", "image/webp", "video/mp4", "audio/mpeg", "audio/wav", "application/pdf"],
};

export function validateUntrustedObject(source: UntrustedSource, limits: IngestLimits = {}): void {
  const policy = { ...DEFAULT_LIMITS, ...limits };
  if (!Number.isSafeInteger(source.byteSize) || source.byteSize <= 0 || source.byteSize > policy.maxBytes)
    throw new Error("INGEST_SIZE_LIMIT_EXCEEDED");
  if (!policy.allowedMime.includes(source.detectedMime.toLowerCase())) throw new Error("INGEST_MIME_REJECTED");
  if (!/^sha256:[a-f0-9]{64}$/i.test(source.sha256)) throw new Error("INGEST_CHECKSUM_INVALID");
  if (source.width !== undefined && source.height !== undefined && source.width * source.height > policy.maxPixels)
    throw new Error("INGEST_PIXEL_LIMIT_EXCEEDED");
  if (source.durationMs !== undefined && source.durationMs > policy.maxDurationMs)
    throw new Error("INGEST_DURATION_LIMIT_EXCEEDED");
}

export async function ingestUntrustedObject(
  source: UntrustedSource,
  limits: IngestLimits = {},
): Promise<QuarantinedObject> {
  validateUntrustedObject(source, limits);
  const mediaMetadata: QuarantinedObject["mediaMetadata"] = {
    ...(source.width !== undefined ? { width: source.width } : {}),
    ...(source.height !== undefined ? { height: source.height } : {}),
    ...(source.durationMs !== undefined ? { durationMs: source.durationMs } : {}),
  };
  return {
    objectId: source.objectId,
    tenantId: source.tenantId,
    quarantine: true,
    byteSize: source.byteSize,
    detectedMime: source.detectedMime.toLowerCase(),
    sha256: source.sha256.toLowerCase(),
    sourceKind: source.kind,
    mediaMetadata,
  };
}
