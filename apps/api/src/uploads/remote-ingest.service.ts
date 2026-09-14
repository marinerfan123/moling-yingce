import { createHash, randomUUID } from "node:crypto";
import { SafeFetchService } from "../governance/safe-fetch.service.js";
import type { UploadPrincipal } from "./uploads.service.js";

const id = () => `ingest_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
const hash = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

export class RemoteIngestService {
  readonly #requests = new Map<string, any>();
  constructor(private readonly safeFetch = new SafeFetchService()) {}

  create(
    principal: UploadPrincipal,
    input: { projectId: string; url: string; declaredMime: string; maxBytes: number; requestId?: string },
  ) {
    if (!principal.tenantId || !principal.memberships.some((m) => m.projectId === input.projectId && m.active))
      throw new Error("PROJECT_MEMBERSHIP_MISSING");
    if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(input.declaredMime))
      throw new Error("UPLOAD_MIME_INVALID");
    const requestHash = hash({
      tenantId: principal.tenantId,
      projectId: input.projectId,
      url: input.url,
      declaredMime: input.declaredMime,
      maxBytes: input.maxBytes,
      requestId: input.requestId,
    });
    const existing = this.#requests.get(requestHash);
    if (existing) return existing;
    const instruction = this.safeFetch.validateRemoteIngestRequest({
      projectId: input.projectId,
      url: input.url,
      maxBytes: input.maxBytes,
    });
    const { url: locator, ...validated } = instruction;
    const task = {
      id: id(),
      tenantId: principal.tenantId,
      projectId: input.projectId,
      instruction: {
        ...validated,
        locator,
        id: id(),
        declaredMime: input.declaredMime,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        requestSha256: requestHash,
        state: "pending" as const,
      },
      mediaTask: {
        route: "ingest-remote-source",
        payloadHash: hash({ requestHash }),
        containsUrl: false,
        providerJobCreated: false,
      },
    };
    this.#requests.set(requestHash, task);
    return task;
  }
}
