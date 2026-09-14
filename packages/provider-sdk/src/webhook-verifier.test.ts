import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  InMemoryWebhookReplayStore,
  clearWebhookReplayKeysForTest,
  verifyWebhook,
  WebhookSecretResolver,
} from "./index.js";

const timestamp = "1787835600";
const rawBody = new TextEncoder().encode('{"externalId":"external_12345678","tenantId":"spoofed"}');
const signature = createHmac("sha256", "webhook-test-secret")
  .update(timestamp)
  .update(".")
  .update(rawBody)
  .digest("hex");

describe("webhook verifier", () => {
  it("verifies bounded raw bytes, timestamp and a durable replay consume before parsing", async () => {
    clearWebhookReplayKeysForTest();
    const store = new InMemoryWebhookReplayStore();
    const input = {
      providerConfigId: "providercfg_12345678",
      rawBody,
      timestamp,
      signature: `sha256=${signature}`,
      secret: "webhook-test-secret",
      now: new Date(Number(timestamp) * 1000),
      replayStore: store,
    };
    await expect(verifyWebhook(input)).resolves.toMatchObject({ rawBody });
    await expect(verifyWebhook(input)).rejects.toThrow("WEBHOOK_REPLAY_DETECTED");
    await expect(
      verifyWebhook({ ...input, rawBody: new Uint8Array(1_000_001), replayStore: new InMemoryWebhookReplayStore() }),
    ).rejects.toThrow("WEBHOOK_RAW_BODY_INVALID");
    await expect(
      verifyWebhook({ ...input, timestamp: "1787000000", replayStore: new InMemoryWebhookReplayStore() }),
    ).rejects.toThrow("WEBHOOK_TIMESTAMP_OUTSIDE_WINDOW");
  });

  it("uses only the audited webhook-verification key class, including cache hits", async () => {
    const events: string[] = [];
    const resolver = new WebhookSecretResolver({
      decryptWebhookVerificationSecret: async () => "webhook-test-secret",
      audit: async (event) => {
        events.push(event.action);
      },
    });
    const ref = {
      providerConfigId: "providercfg_12345678",
      keyClass: "webhook-verification" as const,
      ciphertext: new Uint8Array([1]),
      cacheKey: "ref",
      rotationVersion: "1",
    };
    await resolver.resolve(ref);
    await resolver.resolve(ref);
    expect(events).toEqual(["resolve-webhook-verification", "resolve-webhook-verification"]);
  });
});
