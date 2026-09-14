export type GenerationCredentialKeyClass = "generation-submit" | "webhook-verification";
export type GenerationCredentialRuntime = "generation-worker" | "api" | "media-worker" | "dispatcher" | "collab-worker";

export interface EncryptedGenerationCredential {
  readonly keyClass: GenerationCredentialKeyClass;
  readonly ciphertext: Uint8Array;
  readonly cacheKey: string;
  readonly rotationVersion: string;
}

export interface GenerationCredentialDecryptor {
  decrypt(ciphertext: Uint8Array): Promise<string>;
}

export class GenerationCredentialResolver {
  private readonly cache = new Map<string, { rotationVersion: string; plaintext: string }>();

  constructor(
    private readonly runtime: GenerationCredentialRuntime,
    private readonly decryptor: GenerationCredentialDecryptor,
  ) {}

  async resolve(credential: EncryptedGenerationCredential): Promise<string> {
    if (this.runtime !== "generation-worker") throw new Error("GENERATION_CREDENTIAL_RUNTIME_FORBIDDEN");
    if (credential.keyClass !== "generation-submit") throw new Error("GENERATION_CREDENTIAL_KEY_CLASS_FORBIDDEN");

    const cached = this.cache.get(credential.cacheKey);
    if (cached?.rotationVersion === credential.rotationVersion) return cached.plaintext;

    const plaintext = await this.decryptor.decrypt(credential.ciphertext);
    this.cache.set(credential.cacheKey, { rotationVersion: credential.rotationVersion, plaintext });
    return plaintext;
  }

  rotate(rotationVersion: string): void {
    for (const [cacheKey, cached] of this.cache) {
      if (cached.rotationVersion !== rotationVersion) this.cache.delete(cacheKey);
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
