import { createHash } from "node:crypto";

export class SafeFetchService {
  validateRemoteIngestRequest(input: { projectId: string; url: string; expectedSha256?: string; maxBytes: number }) {
    const url = new URL(input.url);
    if (url.protocol !== "https:") throw new Error("REMOTE_INGEST_HTTPS_REQUIRED");
    if (input.maxBytes <= 0 || input.maxBytes > 500_000_000) throw new Error("REMOTE_INGEST_SIZE_INVALID");
    const instruction = {
      projectId: input.projectId,
      url: input.url,
      expectedSha256: input.expectedSha256,
      maxBytes: input.maxBytes,
      instructionSha256: `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`,
      networkOpened: false as const,
    };
    return instruction;
  }
}
