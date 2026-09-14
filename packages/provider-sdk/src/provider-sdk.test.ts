import { describe, expect, it } from "vitest";

import {
  GenerationCredentialResolver,
  assertLegalRecovery,
  canResubmitAfterRecovery,
  isCancellationTerminal,
  normalizeTransportFailure,
  runProviderContractSuite,
} from "./index.js";
import type {
  GenerationRequest,
  ModelDescriptor,
  ModelProviderAdapter,
  NormalizedProviderError,
  ProviderCancellationResult,
  ProviderContext,
  ProviderEvent,
  ProviderRecoveryResult,
  ProviderStatus,
  ProviderSubmission,
  SignedWebhookRequest,
  ValidationResult,
} from "./index.js";

const observedAt = "2026-01-01T00:00:00.000Z";
const billingEvidence = { source: "provider" as const, observedAt, reference: "contract-billing" };
const request = {
  tenantId: "tenant_12345678",
  projectId: "project_12345678",
  jobId: "job_12345678",
  providerKey: "fake",
  modelKey: "fake/commercial-canvas",
  capability: "image",
  submissionKey: "submission-key-123456",
  prompt: "panel one",
} as const;

class ContractFakeAdapter implements ModelProviderAdapter {
  readonly providerKey = "fake";
  readonly capabilities = ["text", "image", "video", "tts"] as const;
  readonly recoveryMode = "idempotency-key" as const;
  #recoveryIndex = 0;
  #cancelIndex = 0;

  async listModels(_ctx: ProviderContext): Promise<readonly ModelDescriptor[]> {
    return [
      {
        providerKey: this.providerKey,
        modelKey: "fake/commercial-canvas",
        displayName: "Fake Commercial Canvas",
        capabilities: this.capabilities,
        recoveryMode: this.recoveryMode,
        price: { inputMicros: "1000", outputMicros: "2000", currency: "USD", unit: "request" },
        enabled: true,
      },
    ];
  }

  validate(candidate: GenerationRequest): ValidationResult {
    return candidate.providerKey === this.providerKey ? { ok: true, errors: [] } : { ok: false, errors: [] };
  }

  async estimateCost() {
    return { estimatedMicros: "3000", currency: "USD" as const, evidence: billingEvidence };
  }

  async submit(candidate: GenerationRequest): Promise<ProviderSubmission> {
    return {
      providerKey: this.providerKey,
      externalId: `fake-ext-${candidate.submissionKey}`,
      submissionKey: candidate.submissionKey,
      acceptedAt: observedAt,
      billing: { billedMicros: "3000", currency: "USD", evidence: billingEvidence },
      evidence: { source: "provider", observedAt, reference: "contract-submit" },
    };
  }

  async recover(submissionKey: string): Promise<ProviderRecoveryResult> {
    const variants: ProviderRecoveryResult[] = [
      {
        kind: "found",
        submission: {
          providerKey: this.providerKey,
          externalId: `fake-ext-${submissionKey}`,
          submissionKey,
          acceptedAt: observedAt,
          billing: null,
          evidence: { source: "authoritative_lookup", observedAt, reference: "contract-found" },
        },
        evidence: {
          source: "authoritative_lookup",
          observedAt,
          reference: "contract-found",
          lookupMode: "idempotency-key",
          authoritative: true,
        },
      },
      {
        kind: "definitively_absent",
        evidence: {
          source: "authoritative_lookup",
          observedAt,
          reference: "contract-absent",
          lookupMode: "idempotency-key",
          authoritative: true,
        },
      },
      {
        kind: "unknown",
        reasonCode: "PROVIDER_TRANSPORT_AMBIGUOUS",
        evidence: {
          source: "system",
          observedAt,
          reference: "contract-timeout",
          lookupMode: "idempotency-key",
          authoritative: false,
        },
      },
      { kind: "unsupported" },
    ];
    return variants[this.#recoveryIndex++ % variants.length]!;
  }

  async poll(externalId: string): Promise<ProviderStatus> {
    return {
      externalId,
      normalizedStatus: "succeeded",
      progressStage: "complete",
      terminalReason: "completed",
      outputs: [
        { kind: "image", locator: "https://provider.example/fake.png", contentSha256: `sha256:${"a".repeat(64)}` },
      ],
      billing: { billedMicros: "3000", currency: "USD", evidence: billingEvidence },
      evidence: { source: "poll", observedAt, reference: "contract-poll" },
    };
  }

  async cancel(externalId: string): Promise<ProviderCancellationResult> {
    const variants: ProviderCancellationResult[] = [
      {
        kind: "accepted",
        evidence: { source: "provider", observedAt, reference: "contract-cancel", requestAcknowledged: true },
      },
      {
        kind: "already_terminal",
        status: await this.poll(externalId),
        evidence: { source: "provider", observedAt, reference: "contract-terminal", requestAcknowledged: false },
      },
      {
        kind: "unknown",
        reasonCode: "PROVIDER_CANCEL_TRANSPORT_AMBIGUOUS",
        evidence: { source: "system", observedAt, reference: "contract-cancel-timeout", requestAcknowledged: false },
      },
      { kind: "unsupported" },
    ];
    return variants[this.#cancelIndex++ % variants.length]!;
  }

  async parseWebhook(candidate: SignedWebhookRequest): Promise<ProviderEvent> {
    if (candidate.headers["x-fake-signature"] !== "signed:test") throw new Error("PROVIDER_WEBHOOK_SIGNATURE_INVALID");
    return {
      providerKey: this.providerKey,
      externalId: "fake-webhook-ext",
      eventId: "fake-webhook-event",
      receivedAt: candidate.receivedAt,
      status: await this.poll("fake-webhook-ext"),
    };
  }

  normalizeError(error: unknown): NormalizedProviderError {
    return error instanceof Error
      ? { code: error.message, retryable: false, message: error.message }
      : { code: "PROVIDER_UNKNOWN_ERROR", retryable: true, message: "unknown provider error" };
  }
}

describe("provider sdk contract", () => {
  it("accepts deterministic Fake without network and covers recovery/cancel variants", async () => {
    await expect(
      runProviderContractSuite({
        adapter: new ContractFakeAdapter(),
        request,
        webhook: { headers: { "x-fake-signature": "signed:test" }, rawBody: new TextEncoder().encode("{}") },
        expectedRecoveryKinds: ["found", "definitively_absent", "unknown", "unsupported"],
        expectedCancellationKinds: ["accepted", "already_terminal", "unknown", "unsupported"],
      }),
    ).resolves.toMatchObject({ submission: { submissionKey: request.submissionKey } });
  });

  it("requires authoritative lookup evidence before resubmission is allowed", () => {
    expect(canResubmitAfterRecovery({ kind: "unknown", reasonCode: "PROVIDER_TRANSPORT_AMBIGUOUS" })).toBe(false);
    expect(canResubmitAfterRecovery({ kind: "unsupported" })).toBe(false);
    expect(() =>
      assertLegalRecovery({
        kind: "definitively_absent",
        evidence: {
          source: "system",
          observedAt: "2026-01-01T00:00:00.000Z",
          reference: "timeout",
          lookupMode: "idempotency-key",
          authoritative: false,
        },
      }),
    ).toThrow("PROVIDER_RECOVERY_ABSENCE_REQUIRES_AUTHORITATIVE_LOOKUP");
  });

  it("maps transport ambiguity to recovery unknown", () => {
    expect(normalizeTransportFailure(new Error("timeout"))).toMatchObject({
      kind: "unknown",
      reasonCode: "PROVIDER_TRANSPORT_AMBIGUOUS",
    });
  });

  it("treats cancellation accepted as request acknowledgement, not terminal evidence", async () => {
    const adapter = new ContractFakeAdapter();
    expect(isCancellationTerminal(await adapter.cancel("fake-ext:0"))).toBe(false);
    const terminal = await adapter.cancel("fake-ext:1");
    expect(terminal.kind).toBe("already_terminal");
    if (terminal.kind === "already_terminal") expect(terminal.status.normalizedStatus).toBe("succeeded");
  });

  it("decrypts only generation-submit credentials in generation worker and clears cache on rotation", async () => {
    let decryptCount = 0;
    const resolver = new GenerationCredentialResolver("generation-worker", {
      async decrypt(ciphertext) {
        decryptCount += 1;
        return new TextDecoder().decode(ciphertext);
      },
    });
    const credential = {
      keyClass: "generation-submit" as const,
      ciphertext: new TextEncoder().encode("secret-value"),
      cacheKey: "provider:fake",
      rotationVersion: "v1",
    };
    await expect(resolver.resolve(credential)).resolves.toBe("secret-value");
    await expect(resolver.resolve(credential)).resolves.toBe("secret-value");
    expect(decryptCount).toBe(1);
    resolver.rotate("v2");
    await expect(resolver.resolve({ ...credential, rotationVersion: "v2" })).resolves.toBe("secret-value");
    expect(decryptCount).toBe(2);
    await expect(resolver.resolve({ ...credential, keyClass: "webhook-verification" })).rejects.toThrow(
      "GENERATION_CREDENTIAL_KEY_CLASS_FORBIDDEN",
    );
    await expect(
      new GenerationCredentialResolver("api", { decrypt: async () => "x" }).resolve(credential),
    ).rejects.toThrow("GENERATION_CREDENTIAL_RUNTIME_FORBIDDEN");
  });
});
