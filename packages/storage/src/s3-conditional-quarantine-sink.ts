import { createHash } from "node:crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";

import type { SafeFetchOperationContext, SafeFetchQuarantineReceipt, SafeFetchQuarantineSink } from "./safe-fetch.js";

const MIN_MULTIPART_PART_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_PARTS = 10_000;
const productionSinks = new WeakSet<object>();

type ActiveUpload = {
  readonly state: "uploading";
  readonly uploadId: string;
  readonly buffer: Buffer;
  readonly parts: CompletedPart[];
  readonly partDigests: Buffer[];
  readonly hash: ReturnType<typeof createHash>;
  bufferedBytes: number;
  bytes: number;
};
type ExistingObject = {
  readonly state: "existing";
  readonly contentLength: number | undefined;
  readonly hash: ReturnType<typeof createHash>;
  bytes: number;
};
type UploadSession = ActiveUpload | ExistingObject;

function assertContext(context: SafeFetchOperationContext, now: () => number): void {
  if (context.signal.aborted || now() >= context.deadlineAt) throw new Error("SAFE_FETCH_TIMEOUT");
}

function assertQuarantineKey(key: string): void {
  if (!/^quarantine\/provider-output\/[A-Za-z0-9_-]{8,128}$/.test(key))
    throw new Error("SAFE_FETCH_QUARANTINE_KEY_INVALID");
}

function checksumBase64(sha256: string): string {
  const match = /^sha256:([a-f0-9]{64})$/i.exec(sha256);
  if (!match) throw new Error("SAFE_FETCH_QUARANTINE_CHECKSUM_INVALID");
  return Buffer.from(match[1]!, "hex").toString("base64");
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return (
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.Code === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

function isNoSuchUpload(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; Code?: string };
  return candidate.name === "NoSuchUpload" || candidate.Code === "NoSuchUpload";
}

function compositeChecksum(partDigests: readonly Buffer[]): string {
  return `${createHash("sha256").update(Buffer.concat(partDigests)).digest("base64")}-${partDigests.length}`;
}

function committedMultipartMatches(head: HeadObjectCommandOutput, bytes: number, checksum: string): boolean {
  return head.ContentLength === bytes && head.ChecksumType === "COMPOSITE" && head.ChecksumSHA256 === checksum;
}

export function isS3ConditionalQuarantineSink(value: unknown): value is S3ConditionalQuarantineSink {
  return typeof value === "object" && value !== null && productionSinks.has(value);
}

export class S3ConditionalQuarantineSink implements SafeFetchQuarantineSink {
  readonly capability = "conditional-quarantine-v1" as const;
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #expectedBucketOwner: string | undefined;
  readonly #partSize: number;
  readonly #now: () => number;
  readonly #sessions = new Map<string, UploadSession>();

  constructor(
    options: Readonly<{
      client: S3Client;
      bucket: string;
      expectedBucketOwner?: string;
      partSize?: number;
      now?: () => number;
    }>,
  ) {
    if (!options.bucket.trim()) throw new Error("SAFE_FETCH_QUARANTINE_BUCKET_REQUIRED");
    const partSize = options.partSize ?? MIN_MULTIPART_PART_BYTES;
    if (!Number.isSafeInteger(partSize) || partSize < MIN_MULTIPART_PART_BYTES)
      throw new Error("SAFE_FETCH_QUARANTINE_PART_SIZE_INVALID");
    this.#client = options.client;
    this.#bucket = options.bucket;
    this.#expectedBucketOwner = options.expectedBucketOwner;
    this.#partSize = partSize;
    this.#now = options.now ?? Date.now;
    productionSinks.add(this);
  }

  async open(key: string, context: SafeFetchOperationContext): Promise<void> {
    assertQuarantineKey(key);
    assertContext(context, this.#now);
    const abandoned = this.#sessions.get(key);
    if (abandoned?.state === "existing") throw new Error("SAFE_FETCH_QUARANTINE_UPLOAD_IN_PROGRESS");
    if (abandoned) {
      await this.#abortUpload(key, abandoned, context);
      if (this.#sessions.get(key) === abandoned) this.#sessions.delete(key);
    }
    try {
      const head = await this.#head(key, context);
      assertContext(context, this.#now);
      this.#sessions.set(key, {
        state: "existing",
        contentLength: head.ContentLength,
        bytes: 0,
        hash: createHash("sha256"),
      });
      return;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    const created = await this.#client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.#bucket,
        Key: key,
        ChecksumAlgorithm: "SHA256",
        ChecksumType: "COMPOSITE",
        ContentType: "application/octet-stream",
        ...(this.#expectedBucketOwner ? { ExpectedBucketOwner: this.#expectedBucketOwner } : {}),
      }),
      { abortSignal: context.signal },
    );
    assertContext(context, this.#now);
    if (!created.UploadId) throw new Error("SAFE_FETCH_QUARANTINE_UPLOAD_ID_MISSING");
    this.#sessions.set(key, {
      state: "uploading",
      uploadId: created.UploadId,
      buffer: Buffer.allocUnsafe(this.#partSize),
      bufferedBytes: 0,
      bytes: 0,
      parts: [],
      partDigests: [],
      hash: createHash("sha256"),
    });
  }

  async write(key: string, chunk: Uint8Array, context: SafeFetchOperationContext): Promise<void> {
    assertContext(context, this.#now);
    const session = this.#session(key);
    session.hash.update(chunk);
    session.bytes += chunk.byteLength;
    if (session.state === "existing") return;
    let offset = 0;
    while (offset < chunk.byteLength) {
      assertContext(context, this.#now);
      const acceptedBytes = Math.min(this.#partSize - session.bufferedBytes, chunk.byteLength - offset);
      session.buffer.set(chunk.subarray(offset, offset + acceptedBytes), session.bufferedBytes);
      session.bufferedBytes += acceptedBytes;
      offset += acceptedBytes;
      if (session.bufferedBytes === this.#partSize) await this.#uploadBufferedPart(key, session, context);
    }
  }

  async complete(
    key: string,
    accepted: { url: string; pinnedIp: string; tlsServerName: string; bytes: number; sha256: string },
    context: SafeFetchOperationContext,
  ): Promise<SafeFetchQuarantineReceipt> {
    assertContext(context, this.#now);
    const session = this.#session(key);
    const fullObjectChecksum = checksumBase64(accepted.sha256);
    const streamedChecksum = session.hash.digest("base64");
    if (session.bytes !== accepted.bytes || streamedChecksum !== fullObjectChecksum) {
      await this.abort(key, "SAFE_FETCH_QUARANTINE_STREAM_MISMATCH", context).catch(() => undefined);
      throw new Error("SAFE_FETCH_QUARANTINE_STREAM_MISMATCH");
    }
    const receipt = { quarantineKey: key, bytes: accepted.bytes, sha256: accepted.sha256 };
    if (session.state === "existing") {
      this.#sessions.delete(key);
      if (session.contentLength !== undefined && session.contentLength !== accepted.bytes)
        throw new Error("SAFE_FETCH_QUARANTINE_CONFLICT");
      if (!(await this.#reconcileExisting(key, accepted.bytes, fullObjectChecksum, context)))
        throw new Error("SAFE_FETCH_QUARANTINE_CONFLICT");
      return receipt;
    }
    if (session.bufferedBytes > 0) await this.#uploadBufferedPart(key, session, context);
    if (session.parts.length === 0) {
      await this.abort(key, "SAFE_FETCH_QUARANTINE_EMPTY", context).catch(() => undefined);
      throw new Error("SAFE_FETCH_QUARANTINE_EMPTY");
    }
    const expectedComposite = compositeChecksum(session.partDigests);
    try {
      await this.#client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.#bucket,
          Key: key,
          UploadId: session.uploadId,
          MultipartUpload: { Parts: session.parts },
          IfNoneMatch: "*",
          ChecksumType: "COMPOSITE",
          MpuObjectSize: accepted.bytes,
          ...(this.#expectedBucketOwner ? { ExpectedBucketOwner: this.#expectedBucketOwner } : {}),
        }),
        { abortSignal: context.signal },
      );
      assertContext(context, this.#now);
    } catch (completionError) {
      if (!context.signal.aborted && this.#now() < context.deadlineAt) {
        const reconciled = await this.#reconcileExisting(key, accepted.bytes, fullObjectChecksum, context).catch(
          () => false,
        );
        if (reconciled) {
          await this.#abortUpload(key, session, context);
          if (this.#sessions.get(key) === session) this.#sessions.delete(key);
          return receipt;
        }
      }
      throw completionError;
    }
    const head = await this.#head(key, context);
    assertContext(context, this.#now);
    if (!committedMultipartMatches(head, accepted.bytes, expectedComposite))
      throw new Error("SAFE_FETCH_QUARANTINE_FINALIZE_VERIFY_FAILED");
    if (this.#sessions.get(key) === session) this.#sessions.delete(key);
    return receipt;
  }

  async abort(key: string, _reason: string, context: SafeFetchOperationContext): Promise<void> {
    assertQuarantineKey(key);
    const session = this.#sessions.get(key);
    if (!session || session.state === "existing") {
      if (session?.state === "existing") this.#sessions.delete(key);
      return;
    }
    assertContext(context, this.#now);
    await this.#abortUpload(key, session, context);
    if (this.#sessions.get(key) === session) this.#sessions.delete(key);
  }

  async #uploadBufferedPart(key: string, session: ActiveUpload, context: SafeFetchOperationContext): Promise<void> {
    assertContext(context, this.#now);
    const partNumber = session.parts.length + 1;
    if (partNumber > MAX_MULTIPART_PARTS) throw new Error("SAFE_FETCH_QUARANTINE_PART_LIMIT");
    const body = session.buffer.subarray(0, session.bufferedBytes);
    const partDigest = createHash("sha256").update(body).digest();
    const checksum = partDigest.toString("base64");
    const uploaded = await this.#client.send(
      new UploadPartCommand({
        Bucket: this.#bucket,
        Key: key,
        UploadId: session.uploadId,
        PartNumber: partNumber,
        Body: body,
        ContentLength: body.byteLength,
        ChecksumSHA256: checksum,
        ...(this.#expectedBucketOwner ? { ExpectedBucketOwner: this.#expectedBucketOwner } : {}),
      }),
      { abortSignal: context.signal },
    );
    assertContext(context, this.#now);
    if (!uploaded.ETag) throw new Error("SAFE_FETCH_QUARANTINE_PART_ETAG_MISSING");
    if (uploaded.ChecksumSHA256 && uploaded.ChecksumSHA256 !== checksum)
      throw new Error("SAFE_FETCH_QUARANTINE_PART_CHECKSUM_MISMATCH");
    session.parts.push({ ETag: uploaded.ETag, PartNumber: partNumber, ChecksumSHA256: checksum });
    session.partDigests.push(partDigest);
    session.bufferedBytes = 0;
  }

  async #head(key: string, context: SafeFetchOperationContext): Promise<HeadObjectCommandOutput> {
    assertContext(context, this.#now);
    return this.#client.send(
      new HeadObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        ChecksumMode: "ENABLED",
        ...(this.#expectedBucketOwner ? { ExpectedBucketOwner: this.#expectedBucketOwner } : {}),
      }),
      { abortSignal: context.signal },
    );
  }

  async #reconcileExisting(
    key: string,
    bytes: number,
    checksum: string,
    context: SafeFetchOperationContext,
  ): Promise<boolean> {
    assertContext(context, this.#now);
    const object = await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        ...(this.#expectedBucketOwner ? { ExpectedBucketOwner: this.#expectedBucketOwner } : {}),
      }),
      { abortSignal: context.signal },
    );
    assertContext(context, this.#now);
    if ((object.ContentLength !== undefined && object.ContentLength !== bytes) || !object.Body) return false;
    const hash = createHash("sha256");
    let streamedBytes = 0;
    for await (const value of object.Body as AsyncIterable<unknown>) {
      assertContext(context, this.#now);
      if (!(value instanceof Uint8Array)) throw new Error("SAFE_FETCH_QUARANTINE_OBJECT_STREAM_INVALID");
      streamedBytes += value.byteLength;
      if (streamedBytes > bytes) return false;
      hash.update(value);
    }
    assertContext(context, this.#now);
    return streamedBytes === bytes && hash.digest("base64") === checksum;
  }

  async #abortUpload(key: string, session: ActiveUpload, context: SafeFetchOperationContext): Promise<void> {
    assertContext(context, this.#now);
    try {
      await this.#client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.#bucket,
          Key: key,
          UploadId: session.uploadId,
          ...(this.#expectedBucketOwner ? { ExpectedBucketOwner: this.#expectedBucketOwner } : {}),
        }),
        { abortSignal: context.signal },
      );
      assertContext(context, this.#now);
    } catch (error) {
      if (!isNoSuchUpload(error)) throw error;
    }
  }

  #session(key: string): UploadSession {
    assertQuarantineKey(key);
    const session = this.#sessions.get(key);
    if (!session) throw new Error("SAFE_FETCH_QUARANTINE_NOT_OPEN");
    return session;
  }
}
