import { createHash, randomUUID } from "node:crypto";

export type UploadPrincipal = Readonly<{
  tenantId: string;
  userId: string;
  memberships: readonly { projectId: string; role?: string; active: boolean }[];
}>;

export type UploadCreateInput = Readonly<{
  projectId: string;
  declaredMime: string;
  declaredByteSize: number;
  kind?: "image" | "video" | "audio" | "document" | "font" | "other";
  partSize?: number;
  parts?: number;
}>;

type Session = {
  id: string;
  tenantId: string;
  projectId: string;
  assetId: string;
  declaredMime: string;
  declaredByteSize: number;
  kind: NonNullable<UploadCreateInput["kind"]>;
  status: "created" | "uploading" | "completed" | "aborted" | "expired";
  expiresAt: string;
  completeRequest?: string;
  result?: unknown;
};

const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
const digest = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

export class UploadsService {
  readonly #sessions = new Map<string, Session>();
  readonly #assets = new Map<string, { asset: any; versions: any[] }>();

  constructor(private readonly now = () => new Date()) {}

  private assertAccess(principal: UploadPrincipal, projectId: string) {
    if (!principal.tenantId || !principal.memberships.some((m) => m.projectId === projectId && m.active)) {
      throw new Error("PROJECT_MEMBERSHIP_MISSING");
    }
  }

  create(principal: UploadPrincipal, input: UploadCreateInput) {
    this.assertAccess(principal, input.projectId);
    if (!MIME.test(input.declaredMime)) throw new Error("UPLOAD_MIME_INVALID");
    if (
      !Number.isInteger(input.declaredByteSize) ||
      input.declaredByteSize <= 0 ||
      input.declaredByteSize > 500_000_000
    ) {
      throw new Error("UPLOAD_SIZE_INVALID");
    }
    const sessionId = id("upload");
    const assetId = id("asset");
    const expiresAt = new Date(this.now().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const session: Session = {
      id: sessionId,
      tenantId: principal.tenantId,
      projectId: input.projectId,
      assetId,
      declaredMime: input.declaredMime.toLowerCase(),
      declaredByteSize: input.declaredByteSize,
      kind: input.kind ?? "other",
      status: "created",
      expiresAt,
    };
    this.#sessions.set(sessionId, session);
    const count = Math.max(1, input.parts ?? Math.ceil(input.declaredByteSize / (input.partSize ?? 8_000_000)));
    const partUrls = Array.from({ length: count }, (_, index) => ({
      partNumber: index + 1,
      url: `https://upload.invalid/quarantine/${principal.tenantId}/${sessionId}/${index + 1}`,
      expiresAt,
    }));
    return { uploadSession: this.publicSession(session), assetId, partUrls, partCount: count, status: session.status };
  }

  complete(
    principal: UploadPrincipal,
    sessionId: string,
    input: { requestId?: string; parts?: readonly unknown[]; sha256?: string },
  ) {
    const session = this.require(principal, sessionId);
    const requestId = input.requestId ?? digest(input);
    if (session.completeRequest === requestId && session.result) return session.result;
    if (session.status === "aborted" || session.status === "expired") throw new Error("UPLOAD_SESSION_CLOSED");
    if (session.status === "completed") throw new Error("UPLOAD_ALREADY_COMPLETED");
    const versionId = id("assetver");
    const now = this.now().toISOString();
    const version = {
      id: versionId,
      assetId: session.assetId,
      tenantId: session.tenantId,
      projectId: session.projectId,
      sha256: input.sha256 ?? digest({ sessionId, parts: input.parts ?? [] }),
      byteSize: session.declaredByteSize,
      detectedMime: session.declaredMime,
      mediaMetadata: {},
      rightsRecordId: null,
      moderationRecordId: null,
      sourceJobId: null,
      status: "quarantined" as const,
      createdAt: now,
    };
    const asset = {
      id: session.assetId,
      tenantId: session.tenantId,
      projectId: session.projectId,
      kind: session.kind,
      status: "scanning" as const,
      currentVersionId: null,
      createdAt: now,
    };
    const result = {
      uploadSession: this.publicSession({ ...session, status: "completed" }),
      asset,
      assetVersion: version,
      mediaTask: { route: "inspect-upload", payloadHash: digest({ versionId }), providerJobCreated: false },
    };
    session.status = "completed";
    session.completeRequest = requestId;
    session.result = result;
    this.#assets.set(asset.id, { asset, versions: [version] });
    return result;
  }

  abort(principal: UploadPrincipal, sessionId: string) {
    const session = this.require(principal, sessionId);
    if (session.status !== "completed") session.status = "aborted";
    return {
      uploadSession: this.publicSession(session),
      cleanup: {
        operation: "AbortMultipartUpload",
        objectKey: `quarantine/tenants/${session.tenantId}/objects/${session.assetId}/variants/${session.id}`,
      },
    };
  }

  getSession(principal: UploadPrincipal, sessionId: string) {
    return this.publicSession(this.require(principal, sessionId));
  }
  getAsset(principal: UploadPrincipal, assetId: string) {
    const record = this.#assets.get(assetId);
    if (!record || record.asset.tenantId !== principal.tenantId) throw new Error("ASSET_NOT_FOUND");
    this.assertAccess(principal, record.asset.projectId);
    return { ...record.asset, versions: record.versions };
  }
  signVariant(principal: UploadPrincipal, assetId: string, variant = "original") {
    const asset = this.getAsset(principal, assetId);
    if (asset.status !== "ready") throw new Error("ASSET_NOT_READY");
    const objectKey = `tenants/${principal.tenantId}/objects/${assetId}/variants/${variant}`;
    const expiresAt = new Date(this.now().getTime() + 300_000);
    return {
      url: `https://objects.invalid/${objectKey}?expires=${expiresAt.getTime()}`,
      objectKey,
      expiresAt,
      expiresInSeconds: 300,
    };
  }

  private require(principal: UploadPrincipal, sessionId: string) {
    const session = this.#sessions.get(sessionId);
    if (!session || session.tenantId !== principal.tenantId) throw new Error("UPLOAD_SESSION_NOT_FOUND");
    this.assertAccess(principal, session.projectId);
    return session;
  }
  private publicSession(session: Session) {
    const { completeRequest: _request, result: _result, ...publicValue } = session;
    return publicValue;
  }
}
