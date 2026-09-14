import { RightsService } from "./rights.service.js";

export class RightsController {
  constructor(private readonly rights = new RightsService()) {}

  create(...args: Parameters<RightsService["appendRightsRecord"]>) {
    return this.rights.appendRightsRecord(...args);
  }
}
