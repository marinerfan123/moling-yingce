import { RemoteIngestService } from "./remote-ingest.service.js";
import type { UploadPrincipal } from "./uploads.service.js";

export class RemoteIngestController {
  constructor(private readonly remote = new RemoteIngestService()) {}
  create(principal: UploadPrincipal, body: Parameters<RemoteIngestService["create"]>[1]) {
    return this.remote.create(principal, body);
  }
}
