type GenerationQueuePayload = Readonly<{
  eventId: string;
  route: "generation.submit" | "generation.cancel";
  payloadHash: string;
}>;
type GenerationConsumerReceipt = Readonly<{
  consumerName: "generation-worker";
  eventId: string;
  route: string;
  effect: "submit-bootstrapped" | "cancel-bootstrapped";
  redisJobId?: string;
}>;
type WorkBootstrap = (
  eventId: string,
  expectedConsumer: string,
  expectedRoute: string,
  payloadHash: string,
) => Promise<{
  scope: { tenantId: string; projectId: string };
}>;

export class GenerationConsumer {
  readonly #markers = createDurableMarkerStore();
  readonly #receipts = new Map<string, GenerationConsumerReceipt>();
  constructor(private readonly bootstrap: WorkBootstrap = bootstrapWorkEvent) {}

  async consume(payload: GenerationQueuePayload, options: Readonly<{ redisJobId?: string }> = {}) {
    if (!generationQueuePayloadKeys(payload)) throw new Error("GENERATION_CONSUMER_PAYLOAD_INVALID");
    const existing = this.#receipts.get(payload.eventId);
    if (existing) return existing;
    const work = await this.bootstrap(payload.eventId, "generation", payload.route, payload.payloadHash);
    this.#markers.mark(payload.eventId, "bootstrapped", {
      tenantId: work.scope.tenantId,
      projectId: work.scope.projectId,
      route: payload.route,
    });
    const receipt: GenerationConsumerReceipt = {
      consumerName: "generation-worker",
      eventId: payload.eventId,
      route: payload.route,
      effect: payload.route === "generation.cancel" ? "cancel-bootstrapped" : "submit-bootstrapped",
      ...(options.redisJobId ? { redisJobId: options.redisJobId } : {}),
    };
    this.#receipts.set(payload.eventId, receipt);
    this.#markers.mark(payload.eventId, "receipt", receipt);
    return receipt;
  }

  hasDurableMarker(eventId: string) {
    return this.#markers.has(eventId, "bootstrapped");
  }
}

function generationQueuePayloadKeys(value: unknown): value is GenerationQueuePayload {
  if (!value || typeof value !== "object") return false;
  const keys = Object.keys(value);
  return keys.length === 3 && keys.every((key) => ["eventId", "route", "payloadHash"].includes(key));
}

function createDurableMarkerStore() {
  const markers = new Map<string, unknown>();
  return {
    has(eventId: string, step: string) {
      return markers.has(`${eventId}:${step}`);
    },
    mark(eventId: string, step: string, value: unknown = true) {
      const key = `${eventId}:${step}`;
      if (markers.has(key)) return { inserted: false, value: markers.get(key) };
      markers.set(key, value);
      return { inserted: true, value };
    },
  };
}

async function bootstrapWorkEvent(
  eventId: string,
  expectedConsumer: string,
  expectedRoute: string,
  payloadHash: string,
) {
  if (!eventId || expectedConsumer !== "generation" || !expectedRoute || !payloadHash) {
    throw new Error("WORK_EVENT_BOOTSTRAP_INVALID");
  }
  return {
    scope: { tenantId: "tenant_from_verified_event", projectId: "project_from_verified_event" },
    subject: { eventId, route: expectedRoute, payloadHash },
  };
}
