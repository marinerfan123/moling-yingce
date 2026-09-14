export const PROVIDER_EVENT_ROUTES = ["provider.event", "provider.output.ingest"] as const;
export type ProviderEventQueueRoute = (typeof PROVIDER_EVENT_ROUTES)[number];
export type ProviderEventQueuePayload = Readonly<{
  eventId: string;
  route: ProviderEventQueueRoute;
  payloadHash: string;
}>;
const HASH = /^sha256:[a-f0-9]{64}$/;
const forbiddenLocator = /(?:https?:\/\/|s3:\/\/|file:\/\/|[A-Za-z]:\\|\/mnt\/|api[_-]?key|secret)/i;

export function createProviderEventQueuePayload(input: ProviderEventQueuePayload): ProviderEventQueuePayload {
  if (!input.eventId || !HASH.test(input.payloadHash) || !PROVIDER_EVENT_ROUTES.includes(input.route)) {
    throw new Error("PROVIDER_EVENT_QUEUE_PAYLOAD_INVALID");
  }
  if (!providerEventQueuePayloadKeys(input)) throw new Error("PROVIDER_EVENT_QUEUE_EXTRA_KEYS");
  if (forbiddenLocator.test(JSON.stringify(input))) throw new Error("PROVIDER_EVENT_QUEUE_LOCATOR_FORBIDDEN");
  return Object.freeze({ eventId: input.eventId, route: input.route, payloadHash: input.payloadHash });
}
export function providerEventQueuePayloadKeys(value: unknown): value is ProviderEventQueuePayload {
  return (
    !!value &&
    typeof value === "object" &&
    Object.keys(value).length === 3 &&
    Object.keys(value).every((key) => ["eventId", "route", "payloadHash"].includes(key))
  );
}
export function providerEventRedisJobId(payload: ProviderEventQueuePayload): string {
  return `${payload.route}:${payload.eventId}`;
}
