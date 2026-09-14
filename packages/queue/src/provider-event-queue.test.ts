import { describe, expect, it } from "vitest";

import { createProviderEventQueuePayload, providerEventQueuePayloadKeys } from "./provider-event-queue.js";

describe("provider event queue", () => {
  it("contains only an opaque event reference, route and hash", () => {
    const payload = createProviderEventQueuePayload({
      eventId: "event_provider_12345678",
      route: "provider.event",
      payloadHash: `sha256:${"a".repeat(64)}`,
    });
    expect(Object.keys(payload)).toEqual(["eventId", "route", "payloadHash"]);
    expect(providerEventQueuePayloadKeys({ ...payload, tenantId: "spoofed" })).toBe(false);
    expect(() => createProviderEventQueuePayload({ ...payload, eventId: "https://provider.invalid/output" })).toThrow(
      "LOCATOR_FORBIDDEN",
    );
    expect(() => createProviderEventQueuePayload({ ...payload, eventId: "secret_12345678" })).toThrow(
      "LOCATOR_FORBIDDEN",
    );
  });
});
