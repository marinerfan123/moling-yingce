import { createHash } from "node:crypto";

import type { AttemptRecord, AttemptStore, ProviderFetchInstruction } from "./attempt-service.js";
import { createProviderEventQueuePayload, type ProviderEventQueuePayload } from "./provider-contracts.js";

const hash = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

type ProviderOutputStore = AttemptStore & {
  createFetchInstruction?: (attempt: AttemptRecord, locator: string, expiresAt: string) => ProviderFetchInstruction;
};

export class ProviderOutputDispatch {
  constructor(private readonly attempts: ProviderOutputStore) {}

  dispatch(
    input: Readonly<{ attemptId: string; locator: string; expiresAt: string; eventId: string }>,
  ): ProviderEventQueuePayload {
    const attempt = this.attempts.get(input.attemptId);
    if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");
    if (new Date(input.expiresAt).getTime() <= Date.now()) throw new Error("PROVIDER_OUTPUT_REFRESH_REQUIRED");
    const create = this.attempts.createFetchInstruction;
    if (!create) throw new Error("PROVIDER_FETCH_INSTRUCTION_STORE_REQUIRED");
    const instruction = create.call(this.attempts, attempt, input.locator, input.expiresAt);
    return createProviderEventQueuePayload({
      eventId: input.eventId,
      route: "provider.output.ingest",
      payloadHash: hash({ instructionId: instruction.instructionId, payloadHash: instruction.payloadHash }),
    });
  }
}
