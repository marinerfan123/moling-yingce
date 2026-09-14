import { createHash, randomUUID } from "node:crypto";

export type AttemptState =
  | "created"
  | "submitted"
  | "accepted"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "reconciling";
export type SendCheckpoint = "definitely_not_sent" | "possibly_sent" | "bytes_started";
export type CancellationState = "none" | "requested" | "acknowledged" | "unsupported" | "unknown";
export type AttemptRecord = Readonly<{
  attemptId: string;
  billableAttemptId: string;
  tenantId: string;
  projectId: string;
  jobId: string;
  providerConfigId: string;
  submissionKey: string;
  state: AttemptState;
  externalId: string | null;
  cancellationState: CancellationState;
  sendCheckpoint: SendCheckpoint;
}>;
export type AttemptEvidence = Readonly<{ kind: string; observedAt: string; evidenceHash: string }>;
export type AuthoritativeAbsenceEvidence = AttemptEvidence &
  Readonly<{
    source: "authoritative_lookup";
    authoritative: true;
    previousAttemptId: string;
    providerConfigId: string;
    submissionKey: string;
  }>;
export type AttemptTransition = Readonly<{
  attemptId: string;
  expectedState: AttemptState;
  nextState: AttemptState;
  externalId?: string | null;
  cancellationState?: CancellationState;
  sendCheckpoint?: SendCheckpoint;
  evidence: AttemptEvidence;
}>;
export type CancellationReceiptRecord = Readonly<{
  operationKey: string;
  attemptId: string;
  cancellationState: Exclude<CancellationState, "none" | "requested">;
  terminalStatus?: "queued" | "running" | "succeeded" | "failed" | "canceled";
}>;
export type CancellationBegin =
  | Readonly<{ disposition: "invoke" }>
  | Readonly<{ disposition: "existing"; receipt: CancellationReceiptRecord }>;
export type CancellationInvokeStart = CancellationBegin;
export type CancellationCompletion = Readonly<{
  operationKey: string;
  attemptId: string;
  cancellationState: Exclude<CancellationState, "none" | "requested">;
  terminalStatus?: CancellationReceiptRecord["terminalStatus"];
  evidenceHash: string;
}>;
export type ProviderFetchInstruction = Readonly<{
  instructionId: string;
  attemptId: string;
  tenantId: string;
  projectId: string;
  locator: string;
  expiresAt: string;
  payloadHash: string;
}>;

type Awaitable<T> = T | Promise<T>;

export interface AttemptRepository {
  readonly adapterKind: "memory" | "postgres";
  createBeforeSubmit(
    input: Omit<
      AttemptRecord,
      "attemptId" | "billableAttemptId" | "state" | "externalId" | "cancellationState" | "sendCheckpoint"
    >,
  ): Awaitable<AttemptRecord>;
  get(attemptId: string): Awaitable<AttemptRecord | undefined>;
  transition(input: AttemptTransition): Awaitable<AttemptRecord>;
  beginCancellation(operationKey: string, attemptId: string): Awaitable<CancellationBegin>;
  markCancellationInvokeStarted(operationKey: string, attemptId: string): Awaitable<CancellationInvokeStart>;
  completeCancellation(input: CancellationCompletion): Awaitable<CancellationReceiptRecord>;
  createReplacementFromAbsenceEvidence(
    previousAttemptId: string,
    submissionKey: string,
    evidence: AuthoritativeAbsenceEvidence,
  ): Awaitable<AttemptRecord>;
}

/** Synchronous test adapter shape retained for provider-output unit tests. */
export interface AttemptStore extends AttemptRepository {
  readonly adapterKind: "memory";
  createBeforeSubmit(
    input: Omit<
      AttemptRecord,
      "attemptId" | "billableAttemptId" | "state" | "externalId" | "cancellationState" | "sendCheckpoint"
    >,
  ): AttemptRecord;
  get(attemptId: string): AttemptRecord | undefined;
  transition(input: AttemptTransition): AttemptRecord;
  update(
    attemptId: string,
    update: Partial<Pick<AttemptRecord, "state" | "externalId" | "cancellationState" | "sendCheckpoint">>,
  ): AttemptRecord;
  persistFetchInstruction(instruction: ProviderFetchInstruction): void;
  getFetchInstruction(instructionId: string): ProviderFetchInstruction | undefined;
}

const sha256 = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const opaqueId = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
const terminalStates = new Set<AttemptState>(["succeeded", "failed", "canceled"]);
type StoredCancellation = Readonly<{
  attemptId: string;
  tenantId: string;
  projectId: string;
  providerConfigId: string;
  providerCallState: "not_invoked" | "possibly_invoked" | "completed";
  receipt?: CancellationReceiptRecord;
}>;

/** Process-local test adapter. Production composition rejects this adapterKind. */
export class InMemoryAttemptStore implements AttemptStore {
  readonly adapterKind = "memory" as const;
  #attempts = new Map<string, AttemptRecord>();
  #bySubmissionKey = new Map<string, string>();
  #instructions = new Map<string, ProviderFetchInstruction>();
  #evidence = new Map<string, AttemptEvidence[]>();
  #cancellations = new Map<string, StoredCancellation>();
  #consumedAbsenceEvidence = new Set<string>();

  createBeforeSubmit(
    input: Omit<
      AttemptRecord,
      "attemptId" | "billableAttemptId" | "state" | "externalId" | "cancellationState" | "sendCheckpoint"
    >,
  ): AttemptRecord {
    const existingId = this.#bySubmissionKey.get(input.submissionKey);
    if (existingId) {
      const existing = this.#attempts.get(existingId)!;
      if (
        existing.tenantId !== input.tenantId ||
        existing.projectId !== input.projectId ||
        existing.jobId !== input.jobId ||
        existing.providerConfigId !== input.providerConfigId
      )
        throw new Error("GENERATION_ATTEMPT_SCOPE_MISMATCH");
      return existing;
    }
    const attempt: AttemptRecord = Object.freeze({
      ...input,
      attemptId: opaqueId("attempt"),
      billableAttemptId: opaqueId("attempt"),
      state: "created",
      externalId: null,
      cancellationState: "none",
      sendCheckpoint: "definitely_not_sent",
    });
    this.#attempts.set(attempt.attemptId, attempt);
    this.#bySubmissionKey.set(attempt.submissionKey, attempt.attemptId);
    return attempt;
  }

  get(attemptId: string): AttemptRecord | undefined {
    return this.#attempts.get(attemptId);
  }
  all(): readonly AttemptRecord[] {
    return [...this.#attempts.values()];
  }
  listEvidence(attemptId: string): readonly AttemptEvidence[] {
    return [...(this.#evidence.get(attemptId) ?? [])];
  }

  transition(input: AttemptTransition): AttemptRecord {
    const current = this.#attempts.get(input.attemptId);
    if (!current) throw new Error("ATTEMPT_NOT_FOUND");
    if (current.state !== input.expectedState) throw new Error("GENERATION_ATTEMPT_CAS_MISMATCH");
    if (terminalStates.has(current.state)) {
      this.appendEvidence(input.attemptId, {
        ...input.evidence,
        kind:
          input.nextState === current.state
            ? input.evidence.kind
            : `${input.evidence.kind}_late_terminal_conflict`,
      });
      return current;
    }
    const next = Object.freeze({
      ...current,
      state: input.nextState,
      externalId: input.externalId === undefined ? current.externalId : input.externalId,
      cancellationState: input.cancellationState ?? current.cancellationState,
      sendCheckpoint: input.sendCheckpoint ?? current.sendCheckpoint,
    });
    this.#attempts.set(input.attemptId, next);
    this.appendEvidence(input.attemptId, input.evidence);
    return next;
  }

  /** Fixture helper. Runtime code must use transition() with an expected state. */
  update(
    attemptId: string,
    update: Partial<Pick<AttemptRecord, "state" | "externalId" | "cancellationState" | "sendCheckpoint">>,
  ): AttemptRecord {
    const current = this.#attempts.get(attemptId);
    if (!current) throw new Error("ATTEMPT_NOT_FOUND");
    if (terminalStates.has(current.state) && update.state && update.state !== current.state)
      throw new Error("GENERATION_ATTEMPT_TERMINAL_IMMUTABLE");
    const next = Object.freeze({ ...current, ...update });
    this.#attempts.set(attemptId, next);
    return next;
  }

  beginCancellation(operationKey: string, attemptId: string): CancellationBegin {
    const existing = this.#cancellations.get(operationKey);
    if (existing && existing.attemptId !== attemptId) throw new Error("CANCELLATION_OPERATION_SCOPE_MISMATCH");
    const attempt = this.#attempts.get(attemptId);
    if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");
    if (existing) {
      if (
        existing.attemptId !== attemptId ||
        existing.tenantId !== attempt.tenantId ||
        existing.projectId !== attempt.projectId ||
        existing.providerConfigId !== attempt.providerConfigId
      )
        throw new Error("CANCELLATION_OPERATION_SCOPE_MISMATCH");
      if (existing.receipt) return { disposition: "existing", receipt: existing.receipt };
      if (existing.providerCallState === "not_invoked") return { disposition: "invoke" };
      this.appendEvidence(attemptId, {
        kind: "cancellation_unknown_after_invoke_start",
        observedAt: new Date().toISOString(),
        evidenceHash: sha256({ operationKey, attemptId, providerCallState: existing.providerCallState }),
      });
      return { disposition: "existing", receipt: { operationKey, attemptId, cancellationState: "unknown" } };
    }
    this.#cancellations.set(operationKey, {
      attemptId,
      tenantId: attempt.tenantId,
      projectId: attempt.projectId,
      providerConfigId: attempt.providerConfigId,
      providerCallState: "not_invoked",
    });
    if (attempt.cancellationState === "none")
      this.#attempts.set(attemptId, Object.freeze({ ...attempt, cancellationState: "requested" }));
    return { disposition: "invoke" };
  }

  markCancellationInvokeStarted(operationKey: string, attemptId: string): CancellationInvokeStart {
    const operation = this.#cancellations.get(operationKey);
    if (!operation || operation.attemptId !== attemptId) throw new Error("CANCELLATION_OPERATION_SCOPE_MISMATCH");
    if (operation.receipt) return { disposition: "existing", receipt: operation.receipt };
    if (operation.providerCallState !== "not_invoked") {
      return { disposition: "existing", receipt: { operationKey, attemptId, cancellationState: "unknown" } };
    }
    this.#cancellations.set(operationKey, { ...operation, providerCallState: "possibly_invoked" });
    return { disposition: "invoke" };
  }

  completeCancellation(input: CancellationCompletion): CancellationReceiptRecord {
    const operation = this.#cancellations.get(input.operationKey);
    if (!operation || operation.attemptId !== input.attemptId) throw new Error("CANCELLATION_OPERATION_SCOPE_MISMATCH");
    if (operation.receipt) return operation.receipt;
    const attempt = this.#attempts.get(input.attemptId);
    if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");
    const terminal = input.terminalStatus ? terminalAttemptState(input.terminalStatus) : undefined;
    const terminalConflict = terminal !== undefined && terminalStates.has(attempt.state) && attempt.state !== terminal;
    this.#attempts.set(
      input.attemptId,
      Object.freeze({
        ...attempt,
        state: terminalConflict ? attempt.state : (terminal ?? attempt.state),
        cancellationState: input.cancellationState,
      }),
    );
    const receipt: CancellationReceiptRecord = {
      operationKey: input.operationKey,
      attemptId: input.attemptId,
      cancellationState: input.cancellationState,
      ...(input.terminalStatus ? { terminalStatus: input.terminalStatus } : {}),
    };
    this.#cancellations.set(input.operationKey, { ...operation, providerCallState: "completed", receipt });
    this.appendEvidence(input.attemptId, {
      kind: `cancellation_${input.cancellationState}${terminalConflict ? "_late_terminal_conflict" : ""}`,
      observedAt: new Date().toISOString(),
      evidenceHash: input.evidenceHash,
    });
    return receipt;
  }

  createReplacementFromAbsenceEvidence(
    previousAttemptId: string,
    submissionKey: string,
    evidence: AuthoritativeAbsenceEvidence,
  ): AttemptRecord {
    const previous = this.#attempts.get(previousAttemptId);
    if (!previous) throw new Error("ATTEMPT_NOT_FOUND");
    if (
      evidence.previousAttemptId !== previousAttemptId ||
      evidence.providerConfigId !== previous.providerConfigId ||
      evidence.submissionKey !== previous.submissionKey ||
      evidence.source !== "authoritative_lookup" ||
      !evidence.authoritative
    )
      throw new Error("GENERATION_ABSENCE_EVIDENCE_SCOPE_MISMATCH");
    const persisted = this.#evidence
      .get(previousAttemptId)
      ?.some(
        (candidate) =>
          candidate.kind === "recovery_definitively_absent" && candidate.evidenceHash === evidence.evidenceHash,
      );
    if (!persisted) throw new Error("GENERATION_ABSENCE_EVIDENCE_NOT_PERSISTED");
    if (this.#consumedAbsenceEvidence.has(evidence.evidenceHash))
      throw new Error("GENERATION_ABSENCE_EVIDENCE_ALREADY_CONSUMED");
    this.#consumedAbsenceEvidence.add(evidence.evidenceHash);
    return this.createBeforeSubmit({
      tenantId: previous.tenantId,
      projectId: previous.projectId,
      jobId: previous.jobId,
      providerConfigId: previous.providerConfigId,
      submissionKey,
    });
  }

  persistFetchInstruction(instruction: ProviderFetchInstruction): void {
    this.#instructions.set(instruction.instructionId, Object.freeze({ ...instruction }));
  }
  getFetchInstruction(instructionId: string): ProviderFetchInstruction | undefined {
    return this.#instructions.get(instructionId);
  }

  private appendEvidence(attemptId: string, evidence: AttemptEvidence): void {
    const existing = this.#evidence.get(attemptId) ?? [];
    if (existing.some((candidate) => candidate.evidenceHash === evidence.evidenceHash)) return;
    this.#evidence.set(attemptId, [...existing, Object.freeze(evidence)]);
  }
  createFetchInstruction(attempt: AttemptRecord, locator: string, expiresAt: string): ProviderFetchInstruction {
    const instruction: ProviderFetchInstruction = {
      instructionId: opaqueId("ingest"),
      attemptId: attempt.attemptId,
      tenantId: attempt.tenantId,
      projectId: attempt.projectId,
      locator,
      expiresAt,
      payloadHash: sha256({ attemptId: attempt.attemptId, locator, expiresAt }),
    };
    this.persistFetchInstruction(instruction);
    return instruction;
  }
}

function terminalAttemptState(
  status: NonNullable<CancellationReceiptRecord["terminalStatus"]>,
): "succeeded" | "failed" | "canceled" {
  if (status === "succeeded" || status === "failed" || status === "canceled") return status;
  throw new Error("CANCEL_ALREADY_TERMINAL_STATUS_INVALID");
}
