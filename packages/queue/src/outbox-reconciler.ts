import type { OutboxEvent } from "./outbox-dispatcher.js";

export function reconcileOutbox(
  events: readonly OutboxEvent[],
  receipts: { has(consumerName: string, eventId: string): boolean },
  consumerName: string,
) {
  return events
    .filter((event) => event.state === "published" && !receipts.has(consumerName, event.eventId))
    .map((event) => ({ eventId: event.eventId, route: event.route, payloadHash: event.payloadHash }));
}
