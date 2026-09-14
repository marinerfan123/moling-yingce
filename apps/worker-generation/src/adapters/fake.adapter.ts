type Capability = "text" | "image" | "video" | "tts";
type EvidenceSource = "provider" | "system" | "webhook" | "poll" | "authoritative_lookup";
type Evidence = Readonly<{ source: EvidenceSource; observedAt: string; reference: string }>;
type Billing = Readonly<{ billedMicros: string; currency: "USD"; evidence: Evidence }>;
type GenerationRequest = Readonly<{
  providerKey: string;
  capability: Capability;
  submissionKey: string;
}>;
type ModelDescriptor = Readonly<{
  providerKey: string;
  modelKey: string;
  displayName: string;
  capabilities: readonly Capability[];
  recoveryMode: "idempotency-key";
  price: Readonly<{ inputMicros: string; outputMicros: string; currency: "USD"; unit: "request" }>;
  enabled: boolean;
}>;
type NormalizedProviderError = Readonly<{ code: string; retryable: boolean; message: string }>;
type ValidationResult = Readonly<{ ok: boolean; errors: readonly NormalizedProviderError[] }>;
type ProviderSubmission = Readonly<{
  providerKey: string;
  externalId: string;
  submissionKey: string;
  acceptedAt: string;
  billing: Billing | null;
  evidence: Evidence;
}>;
type ProviderStatus = Readonly<{
  externalId: string;
  normalizedStatus: "queued" | "running" | "succeeded" | "failed" | "canceled";
  progressStage: "accepted" | "queued" | "generating" | "uploading" | "moderating" | "complete";
  terminalReason?: string;
  outputs: readonly Readonly<{ kind: Capability; locator?: string; contentSha256?: string }>[];
  billing: Billing | null;
  evidence: Evidence;
}>;
type RecoveryEvidence = Evidence & Readonly<{ lookupMode: "idempotency-key"; authoritative: boolean }>;
type CancellationEvidence = Evidence & Readonly<{ requestAcknowledged: boolean }>;
type ProviderRecoveryResult =
  | Readonly<{ kind: "found"; submission: ProviderSubmission; evidence: RecoveryEvidence }>
  | Readonly<{ kind: "definitively_absent"; evidence: RecoveryEvidence }>
  | Readonly<{ kind: "unknown"; reasonCode: string; evidence: RecoveryEvidence }>
  | Readonly<{ kind: "unsupported" }>;
type ProviderCancellationResult =
  | Readonly<{ kind: "accepted"; evidence: CancellationEvidence }>
  | Readonly<{ kind: "already_terminal"; status: ProviderStatus; evidence: CancellationEvidence }>
  | Readonly<{ kind: "unknown"; reasonCode: string; evidence: CancellationEvidence }>
  | Readonly<{ kind: "unsupported" }>;
type SignedWebhookRequest = Readonly<{
  headers: Readonly<Record<string, string>>;
  rawBody: Uint8Array;
  receivedAt: string;
}>;
type ProviderEvent = Readonly<{
  providerKey: string;
  externalId: string;
  eventId: string;
  receivedAt: string;
  status: ProviderStatus;
}>;
type ProviderContext = Readonly<Record<string, never>>;

const observedAt = "2026-01-01T00:00:00.000Z";
const billingEvidence = {
  source: "provider" as const,
  observedAt,
  reference: "fake-billing-ledger",
};

export class FakeProviderAdapter {
  readonly providerKey = "fake";
  readonly capabilities = ["text", "image", "video", "tts"] as const;
  readonly recoveryMode = "idempotency-key" as const;
  private recoveryIndex = 0;
  private cancelIndex = 0;

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

  validate(request: GenerationRequest): ValidationResult {
    if (request.providerKey !== this.providerKey) {
      return { ok: false, errors: [{ code: "PROVIDER_KEY_MISMATCH", retryable: false, message: "provider mismatch" }] };
    }
    if (!this.capabilities.includes(request.capability)) {
      return {
        ok: false,
        errors: [{ code: "PROVIDER_CAPABILITY_UNSUPPORTED", retryable: false, message: "capability unsupported" }],
      };
    }
    return { ok: true, errors: [] };
  }

  async estimateCost() {
    return {
      estimatedMicros: "3000",
      currency: "USD" as const,
      evidence: billingEvidence,
    };
  }

  async submit(request: GenerationRequest): Promise<ProviderSubmission> {
    return {
      providerKey: this.providerKey,
      externalId: `fake-ext-${request.submissionKey}`,
      submissionKey: request.submissionKey,
      acceptedAt: observedAt,
      billing: { billedMicros: "3000", currency: "USD", evidence: billingEvidence },
      evidence: { source: "provider", observedAt, reference: "fake-submit" },
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
          evidence: { source: "authoritative_lookup", observedAt, reference: "fake-recovery-found" },
        },
        evidence: {
          source: "authoritative_lookup",
          observedAt,
          reference: "fake-recovery-found",
          lookupMode: "idempotency-key",
          authoritative: true,
        },
      },
      {
        kind: "definitively_absent",
        evidence: {
          source: "authoritative_lookup",
          observedAt,
          reference: "fake-recovery-absent",
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
          reference: "fake-timeout",
          lookupMode: "idempotency-key",
          authoritative: false,
        },
      },
      { kind: "unsupported" },
    ];
    return variants[this.recoveryIndex++ % variants.length]!;
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
      evidence: { source: "poll", observedAt, reference: "fake-poll" },
    };
  }

  async cancel(externalId: string): Promise<ProviderCancellationResult> {
    const variants: ProviderCancellationResult[] = [
      {
        kind: "accepted",
        evidence: { source: "provider", observedAt, reference: "fake-cancel-ack", requestAcknowledged: true },
      },
      {
        kind: "already_terminal",
        status: await this.poll(externalId),
        evidence: { source: "provider", observedAt, reference: "fake-cancel-terminal", requestAcknowledged: false },
      },
      {
        kind: "unknown",
        reasonCode: "PROVIDER_CANCEL_TRANSPORT_AMBIGUOUS",
        evidence: { source: "system", observedAt, reference: "fake-cancel-timeout", requestAcknowledged: false },
      },
      { kind: "unsupported" },
    ];
    return variants[this.cancelIndex++ % variants.length]!;
  }

  async parseWebhook(request: SignedWebhookRequest): Promise<ProviderEvent> {
    const signature = request.headers["x-fake-signature"];
    if (signature !== "signed:test") throw new Error("PROVIDER_WEBHOOK_SIGNATURE_INVALID");
    return {
      providerKey: this.providerKey,
      externalId: "fake-webhook-ext",
      eventId: "fake-webhook-event",
      receivedAt: request.receivedAt,
      status: await this.poll("fake-webhook-ext"),
    };
  }

  normalizeError(error: unknown): NormalizedProviderError {
    if (error instanceof Error) return { code: error.message, retryable: false, message: error.message };
    return { code: "PROVIDER_UNKNOWN_ERROR", retryable: true, message: "unknown provider error" };
  }
}
