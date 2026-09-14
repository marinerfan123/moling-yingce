export const GENERATION_ROUTES = ["generation.submit", "generation.cancel"] as const;

export type GenerationRoute = (typeof GENERATION_ROUTES)[number];
export type GenerationQueuePayload = Readonly<{ eventId: string; route: GenerationRoute; payloadHash: string }>;

const allowedPayloadKeys = ["eventId", "route", "payloadHash"] as const;
const forbiddenLocator = /(?:https?:\/\/|s3:\/\/|file:\/\/|[A-Za-z]:\\|\/mnt\/)/i;

export function createGenerationQueuePayload(input: GenerationQueuePayload): GenerationQueuePayload {
  if (!input.eventId || !input.payloadHash || !GENERATION_ROUTES.includes(input.route)) {
    throw new Error("GENERATION_QUEUE_PAYLOAD_INVALID");
  }
  if (!generationQueuePayloadKeys(input)) throw new Error("GENERATION_QUEUE_PAYLOAD_EXTRA_KEYS");
  if (forbiddenLocator.test(JSON.stringify(input))) throw new Error("GENERATION_QUEUE_LOCATOR_FORBIDDEN");
  return Object.freeze({ eventId: input.eventId, route: input.route, payloadHash: input.payloadHash });
}

export function generationQueuePayloadKeys(value: unknown): value is GenerationQueuePayload {
  if (!value || typeof value !== "object") return false;
  const keys = Object.keys(value);
  return keys.length === allowedPayloadKeys.length && keys.every((key) => allowedPayloadKeys.includes(key as never));
}

export function generationRedisJobId(payload: GenerationQueuePayload): string {
  return `${payload.route}:${payload.eventId}`;
}
