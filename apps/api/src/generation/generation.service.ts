import { randomUUID } from "node:crypto";

import { BillingService, type BillingPrincipal, type ProviderCurrency } from "../billing/billing.service.js";
import { BUILTIN_MODEL_CATALOG, type ModelCapability, type ModelCatalogEntry } from "../models/models.service.js";
import { GenerationInputContributorRegistry, hash, type DurableCanvasInput } from "./generation-input-contributors.js";

export type GenerationPrincipal = BillingPrincipal;
export type GenerationJobState =
  | "pending"
  | "queued"
  | "dispatching"
  | "running"
  | "reconciling"
  | "succeeded"
  | "failed"
  | "canceled";
export type GenerationCancellationState = "none" | "requested" | "acknowledged" | "unsupported" | "unknown";

export type GenerationEstimateInput = DurableCanvasInput &
  Readonly<{
    projectId: string;
    modelId: string;
    capability: ModelCapability;
    currency: ProviderCurrency;
    rightsReady?: boolean;
    moderationReady?: boolean;
    aiDisclosureReady?: boolean;
  }>;

export type GenerationCreateInput = GenerationEstimateInput &
  Readonly<{
    operationKey: string;
    submissionKey: string;
  }>;

export type GenerationJobRecord = Readonly<{
  tenantId: string;
  projectId: string;
  jobId: string;
  attemptId: string;
  state: GenerationJobState;
  cancellationState: GenerationCancellationState;
  sourceNodeId: string;
  modelId: string;
  providerConfigId: string;
  providerKey: string;
  modelKey: string;
  capability: ModelCapability;
  inputSnapshotHash: string;
  configSnapshotHash: string;
  activeCanvasRevisionId: string;
  documentEpoch: number;
  stateVectorHash: string;
  durableSeq: number;
  reservationId: string;
  outboxEventId: string;
  payloadHash: string;
  createdAt: string;
  updatedAt: string;
}>;

type OutboxRecord = {
  eventId: string;
  route: "generation.submit" | "generation.cancel";
  payloadHash: string;
  published: boolean;
  terminal: boolean;
};

const DEFAULT_CANVAS = Object.freeze({
  activeCanvasRevisionId: "canvasrev_12345678",
  documentEpoch: 1,
  stateVectorHash: `sha256:${"a".repeat(64)}`,
  durableSeq: 7,
});

export class GenerationService {
  readonly #jobs = new Map<string, GenerationJobRecord>();
  readonly #jobsByOperation = new Map<string, GenerationJobRecord>();
  readonly #jobsBySubmission = new Map<string, GenerationJobRecord>();
  readonly #outbox = new Map<string, OutboxRecord>();
  readonly #idempotency = new Map<string, { fingerprint: string; job: GenerationJobRecord }>();
  readonly #billing: BillingService;
  readonly #inputContributors: GenerationInputContributorRegistry;

  constructor(
    options: Readonly<{ billing?: BillingService; inputContributors?: GenerationInputContributorRegistry }> = {},
  ) {
    this.#billing = options.billing ?? new BillingService();
    this.#inputContributors = options.inputContributors ?? new GenerationInputContributorRegistry();
  }

  releaseReservation(principal: BillingPrincipal, reservationId: string, operationId: string) {
    return this.#billing.release(principal, reservationId, { operationId, currency: "USD" });
  }

  estimate(principal: GenerationPrincipal, input: GenerationEstimateInput) {
    this.assertCreateAllowed(principal, input);
    const model = this.requireModel(input);
    const snapshot = this.assertFreshDurableSnapshot(input);
    const amountMicros = this.estimateMicros(model);
    return {
      tenantId: principal.tenantId,
      projectId: input.projectId,
      sourceNodeId: input.nodeId,
      providerKey: model.providerKey,
      modelKey: model.modelKey,
      capability: input.capability,
      inputSnapshotHash: snapshot.inputHash,
      configSnapshotHash: snapshot.configHash,
      currency: model.price.currency,
      estimatedMicros: amountMicros,
      lines: [{ label: `${model.displayName} ${model.price.unit}`, micros: amountMicros }],
      retentionDays: 30,
      cancellation: {
        state: "none" as const,
        billingTerms: "Undispatched jobs release the reservation; running jobs require provider terminal evidence.",
      },
    };
  }

  async createJob(principal: GenerationPrincipal, input: GenerationCreateInput) {
    const key = this.operationKey(principal, input.operationKey);
    const fingerprint = hash({ method: "POST", operation: "generation.create", body: input });
    const existing = this.#idempotency.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_PAYLOAD_MISMATCH");
      return existing.job;
    }
    const job = this.createJobEffect(principal, input);
    this.#idempotency.set(key, { fingerprint, job });
    return job;
  }

  listOutbox() {
    return [...this.#outbox.values()].map((event) => ({ ...event }));
  }

  markOutboxPublished(eventId: string) {
    const event = this.#outbox.get(eventId);
    if (!event) throw new Error("GENERATION_OUTBOX_NOT_FOUND");
    event.published = true;
  }

  getJob(jobId: string) {
    return this.#jobs.get(jobId);
  }

  updateJobState(jobId: string, state: GenerationJobState) {
    const job = this.#jobs.get(jobId);
    if (!job) throw new Error("GENERATION_JOB_NOT_FOUND");
    const updated = { ...job, state, updatedAt: new Date().toISOString() };
    this.#jobs.set(jobId, updated);
    return updated;
  }

  private createJobEffect(principal: GenerationPrincipal, input: GenerationCreateInput): GenerationJobRecord {
    const existingOperation = this.#jobsByOperation.get(this.operationKey(principal, input.operationKey));
    if (existingOperation) return existingOperation;
    const existingSubmission = this.#jobsBySubmission.get(input.submissionKey);
    if (existingSubmission) return existingSubmission;
    const estimate = this.estimate(principal, input);
    const model = this.requireModel(input);
    const jobId = id("job");
    const attemptId = id("attempt");
    const outboxEventId = id("event");
    const payloadHash = hash({ jobId, attemptId, route: "generation.submit", submissionKey: input.submissionKey });
    const reservation = this.#billing.reserve(principal, {
      projectId: input.projectId,
      attemptId,
      operationId: `reserve_${input.operationKey}`,
      amountMicros: estimate.estimatedMicros,
      currency: estimate.currency,
      providerCurrency: model.price.currency,
    });
    const now = new Date().toISOString();
    const job: GenerationJobRecord = {
      tenantId: principal.tenantId,
      projectId: input.projectId,
      jobId,
      attemptId,
      state: "queued",
      cancellationState: "none",
      sourceNodeId: input.nodeId,
      modelId: input.modelId,
      providerConfigId: model.providerConfigId,
      providerKey: model.providerKey,
      modelKey: model.modelKey,
      capability: input.capability,
      inputSnapshotHash: estimate.inputSnapshotHash,
      configSnapshotHash: estimate.configSnapshotHash,
      activeCanvasRevisionId: input.activeCanvasRevisionId,
      documentEpoch: input.documentEpoch,
      stateVectorHash: input.stateVectorHash,
      durableSeq: input.durableSeq,
      reservationId: reservation.reservation.id,
      outboxEventId,
      payloadHash,
      createdAt: now,
      updatedAt: now,
    };
    this.#jobs.set(jobId, job);
    this.#jobsByOperation.set(this.operationKey(principal, input.operationKey), job);
    this.#jobsBySubmission.set(input.submissionKey, job);
    this.#outbox.set(outboxEventId, {
      ...createGenerationQueuePayload({ eventId: outboxEventId, route: "generation.submit", payloadHash }),
      published: false,
      terminal: false,
    });
    return job;
  }

  private assertCreateAllowed(principal: GenerationPrincipal, input: GenerationEstimateInput) {
    const membership = principal.memberships.find((item) => item.projectId === input.projectId && item.active);
    if (!membership) throw new Error("PROJECT_MEMBERSHIP_MISSING");
    const capabilities = new Set(membership.capabilities ?? []);
    if (membership.role === "Viewer" || (capabilities.size > 0 && !capabilities.has("generation:spend"))) {
      throw new Error("GENERATION_SPEND_NOT_AUTHORIZED");
    }
    if (input.rightsReady === false) throw new Error("GENERATION_RIGHTS_BLOCKED");
    if (input.moderationReady === false) throw new Error("GENERATION_MODERATION_BLOCKED");
    if (input.aiDisclosureReady === false) throw new Error("GENERATION_DISCLOSURE_BLOCKED");
  }

  private assertFreshDurableSnapshot(input: GenerationEstimateInput) {
    if (
      input.activeCanvasRevisionId !== DEFAULT_CANVAS.activeCanvasRevisionId ||
      input.documentEpoch !== DEFAULT_CANVAS.documentEpoch ||
      input.stateVectorHash !== DEFAULT_CANVAS.stateVectorHash ||
      input.durableSeq !== DEFAULT_CANVAS.durableSeq
    ) {
      throw new Error("GENERATION_STALE_CANVAS_SNAPSHOT_409");
    }
    return this.#inputContributors.resolve(input);
  }

  private requireModel(input: Pick<GenerationEstimateInput, "modelId" | "capability" | "currency">): ModelCatalogEntry {
    const model = BUILTIN_MODEL_CATALOG.find((entry) => entry.id === input.modelId && entry.enabled);
    if (!model) throw new Error("GENERATION_MODEL_NOT_FOUND");
    if (!model.capabilities.includes(input.capability)) throw new Error("GENERATION_MODEL_CAPABILITY_UNSUPPORTED");
    if (model.price.currency !== input.currency) throw new Error("GENERATION_CURRENCY_MISMATCH");
    return model;
  }

  private estimateMicros(model: ModelCatalogEntry) {
    return (BigInt(model.price.inputMicros) + BigInt(model.price.outputMicros)).toString();
  }

  private operationKey(principal: GenerationPrincipal, operationKey: string) {
    return `${principal.tenantId}:${principal.userId}:${operationKey}`;
  }
}

function id(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function createGenerationQueuePayload(
  input: Readonly<{ eventId: string; route: "generation.submit"; payloadHash: string }>,
) {
  if (!input.eventId || input.route !== "generation.submit" || !input.payloadHash) {
    throw new Error("GENERATION_QUEUE_PAYLOAD_INVALID");
  }
  return Object.freeze(input);
}
