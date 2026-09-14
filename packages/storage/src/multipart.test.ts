import { describe, expect, it } from "vitest";

import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  reapAbandonedMultipartUpload,
  recordMultipartPart,
  resumeMultipartUpload,
} from "./multipart.js";

describe("multipart upload contract", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  it("resumes interrupted uploads and completes once", () => {
    let upload = createMultipartUpload({
      uploadId: "upload_12345678",
      tenantId: "tenant_12345678",
      objectKey: "quarantine/opaque",
      declaredByteSize: 3,
      declaredMime: "image/png",
      now,
    });
    upload = resumeMultipartUpload(upload, new Date("2026-01-02T00:00:00.000Z"));
    upload = recordMultipartPart(upload, { partNumber: 1, etag: "a", byteSize: 3 });
    const receipt = completeMultipartUpload(upload);
    expect(receipt.operation).toBe("CompleteMultipartUpload");
    expect(completeMultipartUpload(upload)).toEqual(receipt);
  });

  it("reaps a seven-day abandoned session with cleanup", () => {
    const upload = createMultipartUpload({
      uploadId: "upload_12345678",
      tenantId: "tenant_12345678",
      objectKey: "quarantine/opaque",
      declaredByteSize: 1,
      declaredMime: "image/png",
      now,
    });
    const receipt = reapAbandonedMultipartUpload(upload, new Date("2026-01-09T00:00:01.000Z"));
    expect(receipt).toEqual(abortMultipartUpload(upload, "abandoned"));
    expect(receipt?.cleanupObject).toBe(true);
  });
});
