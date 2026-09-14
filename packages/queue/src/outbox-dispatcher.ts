export type OutboxEvent = Readonly<{
  eventId: string;
  route: string;
  payloadHash: string;
  state: "pending" | "claimed" | "published" | "dead_letter" | "terminal";
  attemptCount: number;
  leaseOwner?: string;
}>;

export type OutboxPayload = Readonly<{
  eventId: string;
  route: string;
  payloadHash: string;
}>;

export function createOutboxDispatcher(claimant: string) {
  const claimed = new Set<string>();
  return {
    claim(events: readonly OutboxEvent[], maxRows = 10): readonly OutboxEvent[] {
      return events
        .filter((event) => event.state === "pending" && !claimed.has(event.eventId))
        .slice(0, maxRows)
        .map((event) => {
          claimed.add(event.eventId);
          return { ...event, state: "claimed" as const, leaseOwner: claimant, attemptCount: event.attemptCount + 1 };
        });
    },
    toPayload(event: OutboxEvent): OutboxPayload {
      return { eventId: event.eventId, route: event.route, payloadHash: event.payloadHash };
    },
  };
}
