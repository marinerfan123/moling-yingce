export type WebhookSecretReference = Readonly<{
  providerConfigId: string;
  keyClass: "webhook-verification";
  ciphertext: Uint8Array;
  cacheKey: string;
  rotationVersion: string;
}>;

export interface WebhookSecretDecryptor {
  decryptWebhookVerificationSecret(ciphertext: Uint8Array): Promise<string>;
  audit(event: Readonly<{ action: "resolve-webhook-verification"; providerConfigId: string }>): Promise<void>;
}

/** This intentionally cannot resolve generation-submit credentials. */
export class WebhookSecretResolver {
  #cache = new Map<string, { rotationVersion: string; secret: string }>();

  constructor(private readonly decryptor: WebhookSecretDecryptor) {}

  async resolve(reference: WebhookSecretReference): Promise<string> {
    if (!reference.providerConfigId || reference.keyClass !== "webhook-verification") {
      throw new Error("WEBHOOK_SECRET_REFERENCE_INVALID");
    }
    await this.decryptor.audit({
      action: "resolve-webhook-verification",
      providerConfigId: reference.providerConfigId,
    });
    const cached = this.#cache.get(reference.cacheKey);
    if (cached?.rotationVersion === reference.rotationVersion) return cached.secret;
    const secret = await this.decryptor.decryptWebhookVerificationSecret(reference.ciphertext);
    this.#cache.set(reference.cacheKey, { rotationVersion: reference.rotationVersion, secret });
    return secret;
  }
}
