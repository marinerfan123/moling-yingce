import { isQuarantineKey, opaqueObjectKey, tenantForObjectKey } from "./object-key.js";

export type SignedObjectUrl = Readonly<{ url: string; objectKey: string; expiresAt: Date; expiresInSeconds: number }>;
export type SignedObjectRequest = Readonly<{
  tenantId: string;
  objectKey: string;
  expiresInSeconds?: number;
  now?: Date;
  baseUrl?: string;
}>;

export type ObjectSignPolicyRequest = Readonly<{
  tenantId: string;
  key: string;
  audience: "browser" | "cdn" | "worker";
}>;

export function canSignObject(request: ObjectSignPolicyRequest): boolean {
  return (
    request.audience !== "worker" &&
    !isQuarantineKey(request.key) &&
    tenantForObjectKey(request.key) === request.tenantId
  );
}

export function signReadyObjectUrl(request: SignedObjectRequest): SignedObjectUrl {
  const tenant = tenantForObjectKey(request.objectKey);
  if (!tenant || tenant !== request.tenantId) throw new Error("STORAGE_CROSS_TENANT_ACCESS_DENIED");
  if (isQuarantineKey(request.objectKey)) throw new Error("STORAGE_QUARANTINE_ACCESS_DENIED");
  const seconds = request.expiresInSeconds ?? 300;
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > 900) throw new Error("STORAGE_SIGNED_URL_EXPIRY_INVALID");
  const now = request.now ?? new Date();
  const expiresAt = new Date(now.getTime() + seconds * 1000);
  const baseUrl = request.baseUrl ?? "https://objects.invalid";
  const url = `${baseUrl.replace(/\/$/, "")}/${request.objectKey}?expires=${expiresAt.getTime()}`;
  return { url, objectKey: request.objectKey, expiresAt, expiresInSeconds: seconds };
}

export function createReadyObjectKey(tenantId: string, objectId: string, variant: string): string {
  return opaqueObjectKey(tenantId, objectId, variant);
}

export const createSignedUrl = signReadyObjectUrl;

export async function signObjectUrl(request: ObjectSignPolicyRequest): Promise<string> {
  if (!canSignObject(request)) throw new Error("STORAGE_OBJECT_SIGNING_DENIED");
  return signReadyObjectUrl({ tenantId: request.tenantId, objectKey: request.key }).url;
}
