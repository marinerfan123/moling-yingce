import { UploadsService, type UploadPrincipal } from "../uploads/uploads.service.js";

export class AssetsService {
  constructor(private readonly uploads: UploadsService = new UploadsService()) {}
  read(principal: UploadPrincipal, assetId: string) {
    return this.uploads.getAsset(principal, assetId);
  }
  sign(principal: UploadPrincipal, assetId: string, variant = "original") {
    return this.uploads.signVariant(principal, assetId, variant);
  }
}
