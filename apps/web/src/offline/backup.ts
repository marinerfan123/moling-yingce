import type { OfflineDatabase, OfflineRecord, OfflineStoreName } from "./indexed-db.js";

const cryptoProvider = globalThis.crypto;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const stores = [
  "canvasDocs",
  "composerDrafts",
  "generationIntents",
  "recoveryMetadata",
] as const satisfies readonly OfflineStoreName[];

export type BackupScope = Readonly<{ tenantId: string; projectId: string; canvasId: string; schemaVersion: 1 }>;
export type BackupHeader = BackupScope &
  Readonly<{
    formatVersion: 1;
    algorithm: "AES-256-GCM";
    kdf: "PBKDF2-HMAC-SHA-256";
    iterations: 600000;
    salt: string;
    nonce: string;
  }>;

export async function exportEncryptedBackup(db: OfflineDatabase, scope: BackupScope, passphrase: string) {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const header: BackupHeader = {
    ...scope,
    formatVersion: 1,
    algorithm: "AES-256-GCM",
    kdf: "PBKDF2-HMAC-SHA-256",
    iterations: 600000,
    salt: toBase64(salt),
    nonce: toBase64(nonce),
  };
  const manifest = Object.fromEntries(stores.map((store) => [store, db.list(store)])) as Record<
    OfflineStoreName,
    OfflineRecord[]
  >;
  const manifestJson = JSON.stringify(manifest);
  const plaintext = JSON.stringify({
    manifest,
    plaintextSha256: await sha256(manifestJson),
  });
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await cryptoProvider.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: aad(header) },
    key,
    textEncoder.encode(plaintext),
  );
  return JSON.stringify({ header, ciphertext: toBase64(new Uint8Array(ciphertext)) });
}

export async function previewEncryptedBackup(serialized: string, passphrase: string, expectedScope: BackupScope) {
  const parsed = parseEnvelope(serialized);
  assertScope(parsed.header, expectedScope);
  const plaintext = await decryptEnvelope(parsed, passphrase);
  const manifestHash = await sha256(JSON.stringify(plaintext.manifest));
  if (manifestHash !== plaintext.plaintextSha256) throw new Error("BACKUP_PLAINTEXT_CHECKSUM_MISMATCH");
  return {
    header: parsed.header,
    counts: Object.fromEntries(stores.map((store) => [store, plaintext.manifest[store]?.length ?? 0])) as Record<
      OfflineStoreName,
      number
    >,
    manifest: plaintext.manifest,
  };
}

export async function importEncryptedBackup(
  db: OfflineDatabase,
  serialized: string,
  passphrase: string,
  expectedScope: BackupScope,
) {
  const preview = await previewEncryptedBackup(serialized, passphrase, expectedScope);
  db.transaction((tx) => {
    for (const store of stores) {
      for (const record of preview.manifest[store] ?? []) tx.put(store, record);
    }
  });
  return { imported: true as const, counts: preview.counts };
}

function parseEnvelope(serialized: string) {
  try {
    const parsed = JSON.parse(serialized) as { header: BackupHeader; ciphertext: string };
    if (parsed.header.formatVersion !== 1 || parsed.header.schemaVersion !== 1)
      throw new Error("BACKUP_SCHEMA_UNSUPPORTED");
    if (!parsed.ciphertext) throw new Error("BACKUP_CIPHERTEXT_MISSING");
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("BACKUP_")) throw error;
    throw new Error("BACKUP_ENVELOPE_INVALID");
  }
}

async function decryptEnvelope(envelope: { header: BackupHeader; ciphertext: string }, passphrase: string) {
  try {
    const key = await deriveKey(passphrase, fromBase64(envelope.header.salt));
    const bytes = await cryptoProvider.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(envelope.header.nonce), additionalData: aad(envelope.header) },
      key,
      fromBase64(envelope.ciphertext),
    );
    return JSON.parse(textDecoder.decode(bytes)) as {
      manifest: Record<OfflineStoreName, OfflineRecord[]>;
      plaintextSha256: string;
    };
  } catch {
    throw new Error("BACKUP_DECRYPT_FAILED");
  }
}

function assertScope(header: BackupHeader, expected: BackupScope) {
  if (
    header.tenantId !== expected.tenantId ||
    header.projectId !== expected.projectId ||
    header.canvasId !== expected.canvasId
  ) {
    throw new Error("BACKUP_SCOPE_MISMATCH");
  }
  if (header.schemaVersion !== expected.schemaVersion) throw new Error("BACKUP_SCHEMA_UNSUPPORTED");
}

function aad(header: BackupHeader) {
  return textEncoder.encode(JSON.stringify({ ...header, salt: undefined, nonce: undefined }));
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  cryptoProvider.getRandomValues(bytes);
  return bytes;
}

async function sha256(value: string) {
  const digest = await cryptoProvider.subtle.digest("SHA-256", textEncoder.encode(value));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function toBase64(bytes: Uint8Array) {
  if (typeof btoa === "function") return btoa(String.fromCharCode(...bytes));
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(value: string) {
  if (typeof atob === "function") return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  return Uint8Array.from(Buffer.from(value, "base64"));
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const baseKey = await cryptoProvider.subtle.importKey("raw", textEncoder.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return cryptoProvider.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: exactBufferSource(salt), iterations: 600000 },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function exactBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy as Uint8Array<ArrayBuffer>;
}
