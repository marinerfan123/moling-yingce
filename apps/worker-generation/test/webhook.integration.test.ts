import { describe, expect, it } from "vitest";

import { FakeProviderAdapter } from "../src/adapters/fake.adapter.js";
import { WebhookConsumer } from "../src/webhook-consumer.js";

describe("verified provider webhooks", () => {
  it("derives scope only after the adapter has parsed a verified receipt and keeps tenants out of payload", async () => {
    const consumer = new WebhookConsumer(new FakeProviderAdapter(), {
      bootstrap: async (input) => {
        expect(input.providerConfigId).toBe("providercfg_12345678");
        return { tenantId: "tenant_from_attempt", projectId: "project_from_attempt", attemptId: "attempt_12345678" };
      },
    });
    const payload = await consumer.consume({
      providerConfigId: "providercfg_12345678",
      receiptId: "receipt_12345678",
      payloadHash: `sha256:${"a".repeat(64)}`,
      rawBody: new TextEncoder().encode("{}"),
      headers: { "x-fake-signature": "signed:test" },
      receivedAt: new Date().toISOString(),
    });
    expect(payload).toEqual({
      eventId: "fake-webhook-event",
      route: "provider.event",
      payloadHash: `sha256:${"a".repeat(64)}`,
    });
    expect(JSON.stringify(payload)).not.toContain("tenant_");
  });
});
