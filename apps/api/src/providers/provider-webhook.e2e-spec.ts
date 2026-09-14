import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { apiControllers } from "../app.module.js";
import { ProviderWebhookController } from "./provider-webhook.controller.js";

describe("provider webhook ingress", () => {
  it("registers an isolated raw-body webhook route that validates before enqueueing", async () => {
    const rawBody = new TextEncoder().encode('{"tenantId":"spoofed"}');
    const timestamp = "1787835600";
    const signature = createHmac("sha256", "webhook-test-secret")
      .update(timestamp)
      .update(".")
      .update(rawBody)
      .digest("hex");
    const writes: string[] = [];
    const controller = new ProviderWebhookController(
      { resolve: async () => "webhook-test-secret" },
      {
        verify: async (input) => {
          const expected = createHmac("sha256", input.secret)
            .update(input.timestamp!)
            .update(".")
            .update(input.rawBody)
            .digest("hex");
          if (input.signature !== `sha256=${expected}`) throw new Error("WEBHOOK_SIGNATURE_INVALID");
          return {
            providerConfigId: input.providerConfigId,
            rawBody: input.rawBody,
            payloadHash: `sha256:${"a".repeat(64)}`,
            receiptId: "receipt_12345678",
          };
        },
      },
      {
        routeWebhook: async () => ({
          providerConfigId: "providercfg_12345678",
          keyClass: "webhook-verification",
          ciphertext: new Uint8Array([1]),
          cacheKey: "test",
          rotationVersion: "1",
        }),
        enqueueVerifiedEvent: async (event) => {
          writes.push(event.payloadHash);
        },
      },
    );
    await expect(
      controller.receive({
        providerKey: "fake",
        routeToken: "opaque_route_token",
        rawBody,
        headers: { "x-webhook-timestamp": timestamp, "x-webhook-signature": `sha256=${signature}` },
        now: new Date(Number(timestamp) * 1000),
      }),
    ).resolves.toMatchObject({ accepted: true });
    expect(writes).toHaveLength(1);
    expect(apiControllers).toContain("ProviderWebhookController");
  });
});
