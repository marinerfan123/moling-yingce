export const MEDIA_ROUTES = [
  "media.inspect-upload",
  "media.ingest-remote-source",
  "media.generate-proxies",
  "media.moderate-output",
  "media.promote-ready",
  "media.abort-abandoned-uploads",
  "media.transcode-cfr-mezzanine",
] as const;

export type MediaRoute = (typeof MEDIA_ROUTES)[number];
export type MediaQueuePayload = Readonly<{ eventId: string; route: MediaRoute; payloadHash: string }>;

const forbidden = /https?:\/\//i;
export function createMediaQueuePayload(input: MediaQueuePayload): MediaQueuePayload {
  if (!input.eventId || !input.payloadHash || !MEDIA_ROUTES.includes(input.route))
    throw new Error("MEDIA_QUEUE_PAYLOAD_INVALID");
  if (forbidden.test(JSON.stringify(input))) throw new Error("MEDIA_QUEUE_LOCATOR_FORBIDDEN");
  return Object.freeze({ eventId: input.eventId, route: input.route, payloadHash: input.payloadHash });
}

export function mediaQueuePayloadKeys(value: unknown): value is MediaQueuePayload {
  if (!value || typeof value !== "object") return false;
  const keys = Object.keys(value);
  return keys.length === 3 && keys.every((key) => ["eventId", "route", "payloadHash"].includes(key));
}

export function createDurableMarkerStore() {
  const markers = new Map<string, unknown>();
  return {
    has(eventId: string, step: string) {
      return markers.has(`${eventId}:${step}`);
    },
    get(eventId: string, step: string) {
      return markers.get(`${eventId}:${step}`);
    },
    mark(eventId: string, step: string, value: unknown = true) {
      const key = `${eventId}:${step}`;
      if (markers.has(key)) return { inserted: false, value: markers.get(key) };
      markers.set(key, value);
      return { inserted: true, value };
    },
  };
}
