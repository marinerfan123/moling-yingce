export type WebhookSecretReference = Readonly<{ providerConfigId: string; keyClass: "webhook-verification" }>;
export interface WebhookSecretResolverPort {
  resolve(reference: WebhookSecretReference): Promise<string>;
}
export interface WebhookVerifierPort {
  verify(
    input: Readonly<{
      providerConfigId: string;
      rawBody: Uint8Array;
      timestamp: string | undefined;
      signature: string | undefined;
      secret: string;
      now?: Date;
    }>,
  ): Promise<Readonly<{ providerConfigId: string; rawBody: Uint8Array; payloadHash: string; receiptId: string }>>;
}

export interface ProviderWebhookRouteStore {
  routeWebhook(providerKey: string, routeToken: string): Promise<WebhookSecretReference | null>;
  enqueueVerifiedEvent(
    input: Readonly<{ providerConfigId: string; receiptId: string; payloadHash: string; rawBody: Uint8Array }>,
  ): Promise<void>;
}

/** The controller accepts only an unguessable provider route token before signature verification. */
export class ProviderWebhookController {
  constructor(
    private readonly secrets: WebhookSecretResolverPort,
    private readonly verifier: WebhookVerifierPort,
    private readonly store: ProviderWebhookRouteStore,
  ) {}

  async receive(
    input: Readonly<{
      providerKey: string;
      routeToken: string;
      rawBody: Uint8Array;
      headers: Readonly<Record<string, string>>;
      now?: Date;
    }>,
  ) {
    const reference = await this.store.routeWebhook(input.providerKey, input.routeToken);
    if (!reference) throw new Error("WEBHOOK_PROVIDER_CONFIG_NOT_FOUND");
    const verified = await this.verifier.verify({
      providerConfigId: reference.providerConfigId,
      rawBody: input.rawBody,
      timestamp: input.headers["x-webhook-timestamp"],
      signature: input.headers["x-webhook-signature"],
      secret: await this.secrets.resolve(reference),
      ...(input.now ? { now: input.now } : {}),
    });
    await this.store.enqueueVerifiedEvent({
      providerConfigId: verified.providerConfigId,
      receiptId: verified.receiptId,
      payloadHash: verified.payloadHash,
      rawBody: verified.rawBody,
    });
    return { accepted: true as const, receiptId: verified.receiptId };
  }
}
