import { createHash } from "node:crypto";

import {
  InMemoryAttemptStore,
  type AttemptRecord,
  type AttemptRepository,
  type AttemptState,
  type AuthoritativeAbsenceEvidence,
  type SendCheckpoint,
} from "./attempt-service.js";
import { CancellationService, type CancellationReceipt } from "./cancellation-service.js";
import { decideRecovery, type RecoveryDecision } from "./recovery-service.js";
import type { ModelProviderAdapter, ProviderRecoveryResult } from "./provider-contracts.js";

type SubmitInput = Readonly<{
  tenantId: string;
  projectId: string;
  jobId: string;
  providerConfigId: string;
  providerKey: string;
  modelKey: string;
  capability: "text" | "image" | "video" | "tts";
  submissionKey: string;
}>;

export class JobProcessor {
  readonly attempts: AttemptRepository;
  readonly cancellation: CancellationService;

  constructor(options: Readonly<{ attempts?: AttemptRepository; adapter?: ModelProviderAdapter }> = {}) {
    this.attempts = options.attempts ?? new InMemoryAttemptStore();
    this.adapter = options.adapter;
    this.cancellation = new CancellationService(this.attempts);
  }
  private readonly adapter: ModelProviderAdapter | undefined;

  async submit(input: SubmitInput): Promise<AttemptRecord> {
    if (!this.adapter) throw new Error("PROVIDER_ADAPTER_REQUIRED");
    const attempt = await this.attempts.createBeforeSubmit(input);
    if (attempt.state !== "created") return this.resumePersistedSubmission(attempt, input);
    const validation = this.adapter.validate(input);
    if (!validation.ok) {
      return this.transition(attempt, "failed", "validation_rejected", "definitely_not_sent");
    }
    return this.submitPersistedAttempt(attempt, input);
  }

  async retryIdempotentSubmit(
    attemptId: string,
    input: Readonly<{
      tenantId: string;
      projectId: string;
      jobId: string;
      providerKey: string;
      modelKey: string;
      capability: "text" | "image" | "video" | "tts";
    }>,
  ): Promise<AttemptRecord> {
    if (!this.adapter || this.adapter.recoveryMode !== "idempotency-key")
      throw new Error("IDEMPOTENT_SUBMIT_RETRY_FORBIDDEN");
    const attempt = await this.attempts.get(attemptId);
    if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");
    if (
      attempt.tenantId !== input.tenantId ||
      attempt.projectId !== input.projectId ||
      attempt.jobId !== input.jobId ||
      attempt.state !== "reconciling"
    )
      throw new Error("IDEMPOTENT_SUBMIT_RETRY_SCOPE_OR_STATE_INVALID");
    return this.submitPersistedAttempt(attempt, {
      ...input,
      providerConfigId: attempt.providerConfigId,
      submissionKey: attempt.submissionKey,
    });
  }

  private async submitPersistedAttempt(attempt: AttemptRecord, input: SubmitInput): Promise<AttemptRecord> {
    if (!this.adapter) throw new Error("PROVIDER_ADAPTER_REQUIRED");
    let submitted = attempt;
    if (attempt.state === "created") {
      submitted = await this.transition(attempt, "submitted", "submit_intent_persisted", "definitely_not_sent");
    } else if (attempt.state === "reconciling") {
      submitted = await this.transition(attempt, "submitted", "submit_idempotent_retry", attempt.sendCheckpoint);
    } else if (attempt.state !== "submitted") {
      throw new Error("SUBMIT_PERSISTED_ATTEMPT_STATE_INVALID");
    }
    let invokeStarted = false;
    let checkpointFailure: unknown;
    const advanceCheckpoint = async (checkpoint: SendCheckpoint, kind: string) => {
      try {
        if (submitted.sendCheckpoint === checkpoint || submitted.sendCheckpoint === "bytes_started") return;
        submitted = await this.transition(submitted, "submitted", kind, checkpoint);
      } catch (error) {
        checkpointFailure = error;
        throw error;
      }
    };
    try {
      const submission = await this.adapter.submit(
        { ...input, submissionKey: submitted.submissionKey },
        {
          beforeInvoke: async () => {
            invokeStarted = true;
            await advanceCheckpoint("possibly_sent", "submit_invoke_started");
          },
          bytesStarted: async () => {
            if (!invokeStarted) throw new Error("PROVIDER_SUBMIT_INVOKE_CHECKPOINT_REQUIRED");
            await advanceCheckpoint("bytes_started", "submit_bytes_started");
          },
        },
      );
      if (!invokeStarted) throw new Error("PROVIDER_SUBMIT_INVOKE_CHECKPOINT_REQUIRED");
      return this.attempts.transition({
        attemptId: submitted.attemptId,
        expectedState: "submitted",
        nextState: "accepted",
        externalId: submission.externalId,
        sendCheckpoint: submitted.sendCheckpoint,
        evidence: evidence("provider_submit_accepted", { externalId: submission.externalId }),
      });
    } catch (error) {
      if (checkpointFailure === error || (error instanceof Error && error.message === "PROVIDER_SUBMIT_INVOKE_CHECKPOINT_REQUIRED"))
        throw error;
      const normalized = this.adapter.normalizeError(error);
      const ambiguous = isAmbiguousSubmitFailure(normalized);
      return this.attempts.transition({
        attemptId: submitted.attemptId,
        expectedState: "submitted",
        nextState: ambiguous ? "reconciling" : "failed",
        sendCheckpoint: submitted.sendCheckpoint,
        evidence: evidence(ambiguous ? "submit_transport_ambiguous" : "submit_rejected", normalized),
      });
    }
  }

  private async resumePersistedSubmission(attempt: AttemptRecord, input: SubmitInput): Promise<AttemptRecord> {
    if (!this.adapter) throw new Error("PROVIDER_ADAPTER_REQUIRED");
    if (attempt.state !== "submitted" && attempt.state !== "reconciling") return attempt;
    if (this.adapter.recoveryMode === "idempotency-key") {
      return this.submitPersistedAttempt(attempt, input);
    }
    const recovery: ProviderRecoveryResult =
      this.adapter.recoveryMode === "client-reference-query"
        ? await this.adapter.recover(attempt.submissionKey)
        : { kind: "unsupported" };
    await this.recoverAmbiguousSubmission({
      attemptId: attempt.attemptId,
      submissionKey: attempt.submissionKey,
      recovery,
    });
    const recovered = await this.attempts.get(attempt.attemptId);
    if (!recovered) throw new Error("ATTEMPT_NOT_FOUND");
    return recovered;
  }

  async recoverAmbiguousSubmission(
    input: Readonly<{ attemptId: string; submissionKey: string; recovery: ProviderRecoveryResult }>,
  ): Promise<RecoveryDecision> {
    const attempt = await this.attempts.get(input.attemptId);
    if (!attempt || attempt.submissionKey !== input.submissionKey) throw new Error("RECOVERY_SUBMISSION_KEY_MISMATCH");
    if (
      input.recovery.kind === "definitively_absent" &&
      (input.recovery.evidence.previousAttemptId !== attempt.attemptId ||
        input.recovery.evidence.providerConfigId !== attempt.providerConfigId ||
        input.recovery.evidence.submissionKey !== attempt.submissionKey)
    )
      throw new Error("RECOVERY_ABSENCE_EVIDENCE_SCOPE_MISMATCH");
    const decision = decideRecovery(input.recovery);
    if (input.recovery.kind === "found") {
      await this.attempts.transition({
        attemptId: input.attemptId,
        expectedState: attempt.state,
        nextState: "accepted",
        externalId: input.recovery.submission.externalId,
        evidence: evidence("recovery_found", input.recovery),
      });
    } else {
      await this.attempts.transition({
        attemptId: input.attemptId,
        expectedState: attempt.state,
        nextState: "reconciling",
        evidence:
          input.recovery.kind === "definitively_absent"
            ? {
                kind: "recovery_definitively_absent",
                observedAt: input.recovery.evidence.observedAt,
                evidenceHash: input.recovery.evidence.evidenceHash,
              }
            : evidence(`recovery_${input.recovery.kind}`, input.recovery),
      });
    }
    return decision;
  }

  async recover(attemptId: string): Promise<RecoveryDecision> {
    if (!this.adapter) throw new Error("PROVIDER_ADAPTER_REQUIRED");
    const attempt = await this.attempts.get(attemptId);
    if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");
    return this.recoverAmbiguousSubmission({
      attemptId,
      submissionKey: attempt.submissionKey,
      recovery: await this.adapter.recover(attempt.submissionKey),
    });
  }

  async createReplacementAttempt(
    previousAttemptId: string,
    replacement: Readonly<{ submissionKey: string }>,
    recovery: ProviderRecoveryResult,
  ): Promise<AttemptRecord> {
    if (!this.adapter || this.adapter.recoveryMode !== "client-reference-query")
      throw new Error("RECOVERY_REPLACEMENT_ATTEMPT_FORBIDDEN");
    if (decideRecovery(recovery).state !== "new_attempt_allowed" || recovery.kind !== "definitively_absent")
      throw new Error("RECOVERY_REPLACEMENT_EVIDENCE_REQUIRED");
    return this.attempts.createReplacementFromAbsenceEvidence(
      previousAttemptId,
      replacement.submissionKey,
      recovery.evidence as AuthoritativeAbsenceEvidence,
    );
  }

  async cancel(operationKey: string, attemptId: string): Promise<CancellationReceipt> {
    if (!this.adapter) throw new Error("PROVIDER_ADAPTER_REQUIRED");
    const attempt = await this.attempts.get(attemptId);
    const externalId = attempt?.externalId;
    if (!externalId) throw new Error("ATTEMPT_EXTERNAL_ID_MISSING");
    return this.cancellation.execute(operationKey, attemptId, () => this.adapter!.cancel(externalId));
  }

  private transition(
    attempt: AttemptRecord,
    nextState: AttemptState,
    kind: string,
    sendCheckpoint?: SendCheckpoint,
  ): Promise<AttemptRecord> | AttemptRecord {
    return this.attempts.transition({
      attemptId: attempt.attemptId,
      expectedState: attempt.state,
      nextState,
      ...(sendCheckpoint ? { sendCheckpoint } : {}),
      evidence: evidence(kind, { attemptId: attempt.attemptId, nextState, sendCheckpoint }),
    });
  }
}

function evidence(kind: string, value: unknown) {
  const observedAt = new Date().toISOString();
  return {
    kind,
    observedAt,
    evidenceHash: `sha256:${createHash("sha256").update(JSON.stringify({ kind, observedAt, value })).digest("hex")}`,
  };
}

function isAmbiguousSubmitFailure(error: Readonly<{ code: string; retryable: boolean }>): boolean {
  return error.retryable || /(?:timeout|connection|reset|ambiguous|5\d\d)/i.test(error.code);
}
