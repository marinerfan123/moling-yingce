type MediaQueuePayload = Readonly<{ eventId: string; route: string; payloadHash: string }>;
function store() {
  const values = new Map<string, unknown>();
  return {
    get(k: string) {
      return values.get(k);
    },
    mark(k: string, value: unknown) {
      if (values.has(k)) return false;
      values.set(k, value);
      return true;
    },
  };
}
export function createMediaOutboxConsumer() {
  const receipts = store();
  const markers = store();
  return {
    consume(event: MediaQueuePayload, effect: () => unknown) {
      const receiptKey = `worker-media:${event.eventId}`;
      if (receipts.get(receiptKey) !== undefined) return { status: "duplicate" as const };
      const markerKey = `${event.eventId}:${event.route}`;
      const result = markers.get(markerKey) ?? effect();
      markers.mark(markerKey, result);
      receipts.mark(receiptKey, true);
      return { status: "processed" as const, result };
    },
    receipts,
    markers,
  };
}
