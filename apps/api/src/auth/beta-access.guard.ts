import { BetaAccessService, type BetaAccessMode } from "./beta-access.service.js";

export class BetaAccessGuard {
  constructor(
    private readonly mode: BetaAccessMode,
    private readonly service: BetaAccessService,
  ) {}

  canActivate(subject: string) {
    return this.service.canAccess(this.mode, subject);
  }
}
