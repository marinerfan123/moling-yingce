import { UploadsService, type UploadPrincipal } from "./uploads.service.js";

export class UploadsController {
  constructor(private readonly uploads = new UploadsService()) {}
  create(principal: UploadPrincipal, body: Parameters<UploadsService["create"]>[1]) {
    return this.uploads.create(principal, body);
  }
  complete(principal: UploadPrincipal, uploadSessionId: string, body: Parameters<UploadsService["complete"]>[2]) {
    return this.uploads.complete(principal, uploadSessionId, body);
  }
  abort(principal: UploadPrincipal, uploadSessionId: string) {
    return this.uploads.abort(principal, uploadSessionId);
  }
}
