export const packageName = "@comic-canvas/storage";

export function bootstrap() {
  return { packageName };
}

export {
  createNodeHttpsTransport,
  createSafeFetchProxy,
  isS3ConditionalQuarantineSink,
  S3ConditionalQuarantineSink,
  SafeFetchTransportError,
} from "./safe-fetch.js";
export type {
  NodeHttpsRequest,
  ResolvedAddress,
  RuntimeSafeFetchProxy,
  RuntimeSafeFetchRequest,
  RuntimeSafeFetchResult,
  SafeFetchQuarantineReceipt,
  SafeFetchQuarantineSink,
  SafeFetchOperationContext,
  SafeFetchResolver,
  SafeFetchSink,
  SafeFetchTransport,
  SafeFetchTransportRequest,
  SafeFetchTransportResponse,
} from "./safe-fetch.js";
export { opaqueObjectKey, quarantineObjectKey, isQuarantineKey, tenantForObjectKey } from "./object-key.js";
export {
  canSignObject,
  createReadyObjectKey,
  createSignedUrl,
  signObjectUrl,
  signReadyObjectUrl,
} from "./signed-url.js";
export type { SignedObjectRequest, SignedObjectUrl } from "./signed-url.js";
export { buildQuarantineToReadyPromotion, redactStorageDiagnostic } from "./quarantine.js";
export type { PromotionContract, PromotionRequest } from "./quarantine.js";
export {
  createMultipartUpload,
  resumeMultipartUpload,
  recordMultipartPart,
  completeMultipartUpload,
  abortMultipartUpload,
  reapAbandonedMultipartUpload,
} from "./multipart.js";
export type {
  MultipartPart,
  MultipartUpload,
  MultipartCreateRequest,
  MultipartCompleteReceipt,
  MultipartAbortReceipt,
} from "./multipart.js";
export { ingestUntrustedObject, validateUntrustedObject } from "./untrusted-ingest.js";
export type { UntrustedSource, QuarantinedObject, IngestLimits } from "./untrusted-ingest.js";
