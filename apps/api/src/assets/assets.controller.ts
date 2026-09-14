import { AssetsService } from "./assets.service.js";
import type { UploadPrincipal } from "../uploads/uploads.service.js";

export class AssetsController {
  constructor(private readonly assets = new AssetsService()) {}
  read(principal: UploadPrincipal, assetId: string) {
    return this.assets.read(principal, assetId);
  }
  sign(principal: UploadPrincipal, assetId: string, variant?: string) {
    return this.assets.sign(principal, assetId, variant);
  }
}
