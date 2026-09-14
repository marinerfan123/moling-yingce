export type MultipartPart = Readonly<{
  partNumber: number;
  etag: string;
  byteSize: number;
  sha256?: string;
}>;

export type MultipartUpload = Readonly<{
  uploadId: string;
  tenantId: string;
  objectKey: string;
  declaredByteSize: number;
  declaredMime: string;
  createdAt: Date;
  expiresAt: Date;
  status: "created" | "uploading" | "completed" | "aborted" | "expired";
  parts: readonly MultipartPart[];
}>;

export type MultipartCreateRequest = Readonly<{
  uploadId: string;
  tenantId: string;
  objectKey: string;
  declaredByteSize: number;
  declaredMime: string;
  now?: Date;
  ttlDays?: number;
}>;

export type MultipartCompleteReceipt = Readonly<{
  operation: "CompleteMultipartUpload";
  uploadId: string;
  objectKey: string;
  parts: readonly MultipartPart[];
  idempotencyKey: string;
}>;

export type MultipartAbortReceipt = Readonly<{
  operation: "AbortMultipartUpload";
  uploadId: string;
  objectKey: string;
  cleanupObject: true;
  reason: "requested" | "abandoned" | "expired";
}>;

const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

function assertRequest(request: MultipartCreateRequest) {
  if (!request.uploadId || !request.tenantId || !request.objectKey) throw new Error("MULTIPART_IDENTIFIERS_REQUIRED");
  if (!MIME.test(request.declaredMime)) throw new Error("UPLOAD_MIME_INVALID");
  if (!Number.isSafeInteger(request.declaredByteSize) || request.declaredByteSize <= 0)
    throw new Error("UPLOAD_SIZE_INVALID");
  if (
    request.ttlDays !== undefined &&
    (!Number.isInteger(request.ttlDays) || request.ttlDays <= 0 || request.ttlDays > 7)
  )
    throw new Error("MULTIPART_TTL_INVALID");
}

export function createMultipartUpload(request: MultipartCreateRequest): MultipartUpload {
  assertRequest(request);
  const createdAt = request.now ?? new Date();
  const ttlDays = request.ttlDays ?? 7;
  return {
    uploadId: request.uploadId,
    tenantId: request.tenantId,
    objectKey: request.objectKey,
    declaredByteSize: request.declaredByteSize,
    declaredMime: request.declaredMime,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + ttlDays * 24 * 60 * 60 * 1000),
    status: "created",
    parts: [],
  };
}

export function resumeMultipartUpload(upload: MultipartUpload, now = new Date()): MultipartUpload {
  if (upload.status === "completed" || upload.status === "aborted") return upload;
  if (now >= upload.expiresAt) return { ...upload, status: "expired" };
  return { ...upload, status: "uploading" };
}

export function recordMultipartPart(upload: MultipartUpload, part: MultipartPart): MultipartUpload {
  if (upload.status === "completed" || upload.status === "aborted" || upload.status === "expired")
    throw new Error("MULTIPART_NOT_RESUMABLE");
  if (!Number.isInteger(part.partNumber) || part.partNumber < 1 || part.byteSize <= 0 || !part.etag)
    throw new Error("MULTIPART_PART_INVALID");
  const parts = [...upload.parts.filter((item) => item.partNumber !== part.partNumber), part].sort(
    (a, b) => a.partNumber - b.partNumber,
  );
  return { ...upload, status: "uploading", parts };
}

export function completeMultipartUpload(upload: MultipartUpload, parts = upload.parts): MultipartCompleteReceipt {
  if (upload.status === "aborted" || upload.status === "expired") throw new Error("MULTIPART_NOT_COMPLETABLE");
  const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  if (!ordered.length || ordered.some((part, index) => part.partNumber !== index + 1))
    throw new Error("MULTIPART_PARTS_INCOMPLETE");
  const byteSize = ordered.reduce((sum, part) => sum + part.byteSize, 0);
  if (byteSize !== upload.declaredByteSize) throw new Error("MULTIPART_SIZE_MISMATCH");
  return {
    operation: "CompleteMultipartUpload",
    uploadId: upload.uploadId,
    objectKey: upload.objectKey,
    parts: ordered,
    idempotencyKey: `multipart:${upload.uploadId}:complete`,
  };
}

export function abortMultipartUpload(
  upload: MultipartUpload,
  reason: MultipartAbortReceipt["reason"] = "requested",
): MultipartAbortReceipt {
  return {
    operation: "AbortMultipartUpload",
    uploadId: upload.uploadId,
    objectKey: upload.objectKey,
    cleanupObject: true,
    reason,
  };
}

export function reapAbandonedMultipartUpload(
  upload: MultipartUpload,
  now = new Date(),
): MultipartAbortReceipt | undefined {
  if ((upload.status === "created" || upload.status === "uploading") && now >= upload.expiresAt)
    return abortMultipartUpload(upload, "abandoned");
  return undefined;
}
