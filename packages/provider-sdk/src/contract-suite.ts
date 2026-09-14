import {
  assertAdapterShape,
  assertLegalRecovery,
  canResubmitAfterRecovery,
  isCancellationTerminal,
} from "./adapter.js";
import type {
  GenerationRequest,
  ModelDescriptor,
  ModelProviderAdapter,
  ProviderCancellationResult,
  ProviderEvent,
  ProviderRecoveryResult,
  ProviderStatus,
} from "./types.js";

export interface ProviderContractFixture {
  readonly adapter: ModelProviderAdapter;
  readonly request: GenerationRequest;
  readonly webhook: {
    readonly headers: Readonly<Record<string, string>>;
    readonly rawBody: Uint8Array;
  };
  readonly expectedRecoveryKinds: readonly ProviderRecoveryResult["kind"][];
  readonly expectedCancellationKinds: readonly ProviderCancellationResult["kind"][];
}

function assertMoneyMicros(value: string, code: string): void {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(code);
}

function assertGenerationRequest(value: GenerationRequest): void {
  if (!value.tenantId.startsWith("tenant_")) throw new Error("PROVIDER_REQUEST_TENANT_INVALID");
  if (!value.projectId.startsWith("project_")) throw new Error("PROVIDER_REQUEST_PROJECT_INVALID");
  if (!value.jobId.startsWith("job_")) throw new Error("PROVIDER_REQUEST_JOB_INVALID");
  if (!value.providerKey || !value.modelKey) throw new Error("PROVIDER_REQUEST_MODEL_INVALID");
  if (value.submissionKey.length < 12) throw new Error("PROVIDER_REQUEST_SUBMISSION_KEY_INVALID");
}

function assertModelDescriptor(value: ModelDescriptor): void {
  if (value.providerKey.length === 0 || value.modelKey.length === 0) throw new Error("PROVIDER_MODEL_KEY_INVALID");
  if (value.displayName.trim().length === 0) throw new Error("PROVIDER_MODEL_DISPLAY_NAME_INVALID");
  if (value.capabilities.length === 0) throw new Error("PROVIDER_MODEL_CAPABILITIES_EMPTY");
  assertMoneyMicros(value.price.inputMicros, "PROVIDER_MODEL_INPUT_PRICE_INVALID");
  assertMoneyMicros(value.price.outputMicros, "PROVIDER_MODEL_OUTPUT_PRICE_INVALID");
}

function assertProviderStatus(value: ProviderStatus): void {
  if (value.externalId.length === 0) throw new Error("PROVIDER_STATUS_EXTERNAL_ID_INVALID");
  if (value.evidence.reference.length === 0 || value.evidence.observedAt.length === 0) {
    throw new Error("PROVIDER_STATUS_EVIDENCE_INVALID");
  }
  if (value.billing) assertMoneyMicros(value.billing.billedMicros, "PROVIDER_STATUS_BILLING_INVALID");
}

function assertProviderEvent(value: ProviderEvent): void {
  if (value.providerKey.length === 0 || value.externalId.length === 0 || value.eventId.length === 0) {
    throw new Error("PROVIDER_EVENT_INVALID");
  }
  assertProviderStatus(value.status);
}

export async function runProviderContractSuite(fixture: ProviderContractFixture) {
  const { adapter, request } = fixture;
  assertAdapterShape(adapter);
  assertGenerationRequest(request);

  const models = await adapter.listModels({});
  if (models.length === 0) throw new Error("PROVIDER_MODELS_EMPTY");
  for (const model of models) {
    assertModelDescriptor(model);
    for (const capability of model.capabilities) {
      if (!adapter.capabilities.includes(capability)) throw new Error("PROVIDER_MODEL_CAPABILITY_NOT_DECLARED");
    }
    if (model.providerKey !== adapter.providerKey) throw new Error("PROVIDER_MODEL_KEY_MISMATCH");
  }

  const validation = adapter.validate(request);
  if (!validation.ok)
    throw new Error(`PROVIDER_FIXTURE_INVALID:${validation.errors.map((error) => error.code).join(",")}`);

  const estimate = await adapter.estimateCost(request);
  assertMoneyMicros(estimate.estimatedMicros, "PROVIDER_COST_MICROS_INVALID");

  const submission = await adapter.submit(request);
  if (submission.submissionKey !== request.submissionKey) throw new Error("PROVIDER_SUBMISSION_KEY_MISMATCH");

  const status = await adapter.poll(submission.externalId);
  assertProviderStatus(status);

  const event = await adapter.parseWebhook({
    providerKey: adapter.providerKey,
    receivedAt: new Date(0).toISOString(),
    ...fixture.webhook,
  });
  assertProviderEvent(event);

  const recoveryKinds = new Set<ProviderRecoveryResult["kind"]>();
  for (let index = 0; index < fixture.expectedRecoveryKinds.length; index += 1) {
    const recovery = assertLegalRecovery(await adapter.recover(`${request.submissionKey}:${index}`));
    recoveryKinds.add(recovery.kind);
    if ((recovery.kind === "unknown" || recovery.kind === "unsupported") && canResubmitAfterRecovery(recovery)) {
      throw new Error("PROVIDER_UNSAFE_RESUBMIT_PREDICATE");
    }
  }

  const cancellationKinds = new Set<ProviderCancellationResult["kind"]>();
  for (let index = 0; index < fixture.expectedCancellationKinds.length; index += 1) {
    const cancellation = await adapter.cancel(`${submission.externalId}:${index}`);
    cancellationKinds.add(cancellation.kind);
    if (cancellation.kind === "accepted" && isCancellationTerminal(cancellation)) {
      throw new Error("PROVIDER_CANCEL_ACCEPTED_IS_NOT_TERMINAL");
    }
    if (cancellation.kind === "already_terminal") assertProviderStatus(cancellation.status);
  }

  for (const kind of fixture.expectedRecoveryKinds) {
    if (!recoveryKinds.has(kind)) throw new Error(`PROVIDER_RECOVERY_VARIANT_MISSING:${kind}`);
  }
  for (const kind of fixture.expectedCancellationKinds) {
    if (!cancellationKinds.has(kind)) throw new Error(`PROVIDER_CANCEL_VARIANT_MISSING:${kind}`);
  }

  const serialized = JSON.stringify(adapter);
  if (/secret|token|sk-|authorization/i.test(serialized)) throw new Error("PROVIDER_SECRET_SERIALIZED");

  return { models, submission, status, event };
}
