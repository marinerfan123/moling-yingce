export type ModelCapability = "text" | "image" | "video" | "tts";
export type ProviderCurrency = "USD" | "CNY" | "EUR" | "JPY" | "KRW";
export type ProviderRecoveryMode = "idempotency-key" | "client-reference-query" | "unsupported";
export type ModelProviderKey = string;
export type ModelKey = string;

export interface ProviderEvidence {
  readonly source: "provider" | "system" | "webhook" | "poll" | "authoritative_lookup";
  readonly observedAt: string;
  readonly reference: string;
  readonly checksum?: string;
}

export interface ProviderBilling {
  readonly billedMicros: string;
  readonly currency: ProviderCurrency;
  readonly evidence: ProviderEvidence;
}

export interface ModelDescriptor {
  readonly providerKey: ModelProviderKey;
  readonly modelKey: ModelKey;
  readonly displayName: string;
  readonly capabilities: readonly ModelCapability[];
  readonly recoveryMode: ProviderRecoveryMode;
  readonly price: {
    readonly inputMicros: string;
    readonly outputMicros: string;
    readonly currency: ProviderCurrency;
    readonly unit: "request" | "token" | "second" | "image" | "frame";
  };
  readonly maxInputTokens?: number;
  readonly maxOutputTokens?: number;
  readonly enabled: boolean;
}

export interface GenerationRequest {
  readonly tenantId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly providerKey: ModelProviderKey;
  readonly modelKey: ModelKey;
  readonly capability: ModelCapability;
  readonly submissionKey: string;
  readonly prompt?: string;
  readonly inputAssetVersionIds?: readonly string[];
  readonly parameters?: Readonly<Record<string, unknown>>;
}

export interface ProviderOutput {
  readonly kind: ModelCapability;
  readonly assetVersionId?: string;
  readonly locator?: string;
  readonly contentSha256?: string;
  readonly mime?: string;
}

export interface ProviderStatus {
  readonly externalId: string;
  readonly normalizedStatus: "queued" | "running" | "succeeded" | "failed" | "canceled";
  readonly progressStage: "accepted" | "queued" | "generating" | "uploading" | "moderating" | "complete";
  readonly terminalReason?: string;
  readonly outputs: readonly ProviderOutput[];
  readonly billing: ProviderBilling | null;
  readonly evidence: ProviderEvidence;
}

export interface ProviderEvent {
  readonly providerKey: ModelProviderKey;
  readonly externalId: string;
  readonly eventId: string;
  readonly status: ProviderStatus;
  readonly receivedAt: string;
}

export interface ProviderContext {
  readonly tenantId?: string;
  readonly projectId?: string;
  readonly now?: Date;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: readonly NormalizedProviderError[];
}

export interface CostEstimate {
  readonly estimatedMicros: string;
  readonly currency: ProviderCurrency;
  readonly evidence: ProviderEvidence;
}

export interface ProviderSubmission {
  readonly providerKey: ModelProviderKey;
  readonly externalId: string;
  readonly submissionKey: string;
  readonly acceptedAt: string;
  readonly billing: ProviderBilling | null;
  readonly evidence: ProviderEvidence;
}

export interface RecoveryEvidence extends ProviderEvidence {
  readonly lookupMode: Exclude<ProviderRecoveryMode, "unsupported">;
  readonly authoritative: boolean;
}

export interface CancellationEvidence extends ProviderEvidence {
  readonly requestAcknowledged: boolean;
}

export type ProviderRecoveryResult =
  | { readonly kind: "found"; readonly submission: ProviderSubmission; readonly evidence: RecoveryEvidence }
  | { readonly kind: "definitively_absent"; readonly evidence: RecoveryEvidence }
  | { readonly kind: "unknown"; readonly reasonCode: string; readonly evidence?: RecoveryEvidence }
  | { readonly kind: "unsupported" };

export type ProviderCancellationResult =
  | { readonly kind: "accepted"; readonly evidence: CancellationEvidence }
  | { readonly kind: "already_terminal"; readonly status: ProviderStatus; readonly evidence: CancellationEvidence }
  | { readonly kind: "unknown"; readonly reasonCode: string; readonly evidence?: CancellationEvidence }
  | { readonly kind: "unsupported" };

export interface SignedWebhookRequest {
  readonly providerKey: ModelProviderKey;
  readonly headers: Readonly<Record<string, string>>;
  readonly rawBody: Uint8Array;
  readonly receivedAt: string;
}

export interface NormalizedProviderError {
  readonly code: string;
  readonly retryable: boolean;
  readonly message: string;
  readonly evidence?: ProviderEvidence;
}

export interface ModelProviderAdapter {
  readonly providerKey: ModelProviderKey;
  readonly capabilities: readonly ModelCapability[];
  readonly recoveryMode: ProviderRecoveryMode;
  listModels(ctx: ProviderContext): Promise<readonly ModelDescriptor[]>;
  validate(request: GenerationRequest): ValidationResult;
  estimateCost(request: GenerationRequest): Promise<CostEstimate>;
  submit(request: GenerationRequest): Promise<ProviderSubmission>;
  recover(submissionKey: string): Promise<ProviderRecoveryResult>;
  poll(externalId: string): Promise<ProviderStatus>;
  cancel(externalId: string): Promise<ProviderCancellationResult>;
  parseWebhook(request: SignedWebhookRequest): Promise<ProviderEvent>;
  normalizeError(error: unknown): NormalizedProviderError;
}
