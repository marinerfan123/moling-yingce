import { describe, expect, it } from "vitest";

import { createProviderEventQueuePayload as createSharedPayload } from "@comic-canvas/queue";

import { createProviderEventQueuePayload as createWorkerPayload } from "../src/provider-contracts.js";

describe("worker provider contract port", () => {
  it("matches the shared opaque provider-event queue contract", () => {
    const input = {
      eventId: "event_provider_12345678",
      route: "provider.event" as const,
      payloadHash: `sha256:${"a".repeat(64)}`,
    };
    expect(createWorkerPayload(input)).toEqual(createSharedPayload(input));
    expect(() => createWorkerPayload({ ...input, eventId: "https://provider.invalid/output" })).toThrow(
      "LOCATOR_FORBIDDEN",
    );
    expect(() => createWorkerPayload({ ...input, tenantId: "spoofed" } as never)).toThrow("EXTRA_KEYS");
  });
});
