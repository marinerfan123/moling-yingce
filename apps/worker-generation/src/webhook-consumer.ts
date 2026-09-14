import {
  createProviderEventQueuePayload,
  type ModelProviderAdapter,
  type ProviderEventQueuePayload,
} from "./provider-contracts.js";

export type VerifiedWebhookScope = Readonly<{ tenantId: string; projectId: string; attemptId: string }>;
export interface VerifiedWebhookBootstrap {
  bootstrap(
    input: Readonly<{ providerConfigId: string; externalId: string; receiptId: string; payloadHash: string }>,
  ): Promise<VerifiedWebhookScope | null>;
}

export class WebhookConsumer {
  constructor(
    private readonly adapter: ModelProviderAdapter,
    private readonly bootstrap: VerifiedWebhookBootstrap,
  ) {}

  async consume(
    input: Readonly<{
      providerConfigId: string;
      receiptId: string;
      payloadHash: string;
      rawBody: Uint8Array;
      headers: Readonly<Record<string, string>>;
      receivedAt: string;
    }>,
  ): Promise<ProviderEventQueuePayload> {
    const event = await this.adapter.parseWebhook({
      providerKey: this.adapter.providerKey,
      rawBody: input.rawBody,
      headers: input.headers,
      receivedAt: input.receivedAt,
    });
    const scope = await this.bootstrap.bootstrap({
      providerConfigId: input.providerConfigId,
      externalId: event.externalId,
      receiptId: input.receiptId,
      payloadHash: input.payloadHash,
    });
    if (!scope) throw new Error("WEBHOOK_ATTEMPT_SCOPE_NOT_VERIFIED");
    return createProviderEventQueuePayload({
      eventId: event.eventId,
      route: "provider.event",
      payloadHash: input.payloadHash,
    });
  }
}
