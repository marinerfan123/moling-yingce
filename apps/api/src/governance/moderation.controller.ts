import { ModerationGateway } from "./moderation.gateway.js";

export class ModerationController {
  constructor(private readonly moderation = new ModerationGateway()) {}

  record(...args: Parameters<ModerationGateway["recordDecision"]>) {
    return this.moderation.recordDecision(...args);
  }
}
