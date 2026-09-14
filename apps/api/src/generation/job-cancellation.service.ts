import type { BillingPrincipal } from "../billing/billing.service.js";
import { hash } from "./generation-input-contributors.js";
import type { GenerationJobRecord, GenerationService } from "./generation.service.js";

type CancelEffect = "canceled-undispatched" | "requested-provider-cancel";

export class JobCancellationService {
  readonly #operations = new Map<
    string,
    { effect: CancelEffect; job: GenerationJobRecord; outboxEventId: string | null }
  >();

  constructor(private readonly generation: GenerationService) {}

  cancel(principal: BillingPrincipal, input: Readonly<{ projectId: string; jobId: string; operationKey: string }>) {
    const job = this.generation.getJob(input.jobId);
    if (!job || job.projectId !== input.projectId || job.tenantId !== principal.tenantId) {
      throw new Error("GENERATION_JOB_NOT_FOUND");
    }
    if (!principal.memberships.some((membership) => membership.projectId === input.projectId && membership.active)) {
      throw new Error("PROJECT_MEMBERSHIP_MISSING");
    }
    const opKey = `${principal.tenantId}:${input.projectId}:${input.jobId}:${input.operationKey}`;
    const existing = this.#operations.get(opKey);
    if (existing) return existing;
    const outbox = this.generation.listOutbox().find((event) => event.eventId === job.outboxEventId);
    if ((job.state === "pending" || job.state === "queued") && outbox && !outbox.published) {
      const canceled = this.generation.updateJobState(job.jobId, "canceled");
      this.generation.releaseReservation(principal, job.reservationId, `release_${input.operationKey}`);
      const result = { effect: "canceled-undispatched" as const, job: canceled, outboxEventId: null };
      this.#operations.set(opKey, result);
      return result;
    }
    const cancelEventId = `event_cancel_${job.jobId.slice(-8)}`;
    createGenerationQueuePayload({
      eventId: cancelEventId,
      route: "generation.cancel",
      payloadHash: hash({ jobId: job.jobId, operationKey: input.operationKey }),
    });
    const requested = { ...job, cancellationState: "requested" as const, updatedAt: new Date().toISOString() };
    const result = { effect: "requested-provider-cancel" as const, job: requested, outboxEventId: cancelEventId };
    this.#operations.set(opKey, result);
    return result;
  }
}

function createGenerationQueuePayload(
  input: Readonly<{ eventId: string; route: "generation.cancel"; payloadHash: string }>,
) {
  if (!input.eventId || input.route !== "generation.cancel" || !input.payloadHash) {
    throw new Error("GENERATION_QUEUE_PAYLOAD_INVALID");
  }
  return Object.freeze(input);
}
