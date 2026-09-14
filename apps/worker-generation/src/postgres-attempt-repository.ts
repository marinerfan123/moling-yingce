import type {
  AttemptRecord,
  AttemptRepository,
  AttemptTransition,
  AuthoritativeAbsenceEvidence,
  CancellationBegin,
  CancellationCompletion,
  CancellationInvokeStart,
  CancellationReceiptRecord,
} from "./attempt-service.js";

export type AttemptRepositoryQueryPort = Readonly<{
  query(sql: string, params: readonly unknown[]): Promise<readonly Record<string, unknown>[]>;
}>;

type AttemptRow = Readonly<{
  attempt_id: string;
  billable_attempt_id: string;
  tenant_id: string;
  project_id: string;
  job_id: string;
  provider_config_id: string;
  submission_key: string;
  state: AttemptRecord["state"];
  external_id: string | null;
  cancellation_state: AttemptRecord["cancellationState"];
  send_checkpoint: AttemptRecord["sendCheckpoint"];
}>;

export class PostgresAttemptRepository implements AttemptRepository {
  readonly adapterKind = "postgres" as const;

  constructor(private readonly db: AttemptRepositoryQueryPort) {}

  async createBeforeSubmit(
    input: Omit<
      AttemptRecord,
      "attemptId" | "billableAttemptId" | "state" | "externalId" | "cancellationState" | "sendCheckpoint"
    >,
  ): Promise<AttemptRecord> {
    const rows = await this.db.query("select * from app.get_generation_attempt_by_submission_key($1)", [
      input.submissionKey,
    ]);
    const attempt = mapAttempt(rows[0]);
    if (!attempt) throw new Error("GENERATION_ATTEMPT_NOT_PERSISTED");
    if (
      attempt.tenantId !== input.tenantId ||
      attempt.projectId !== input.projectId ||
      attempt.jobId !== input.jobId ||
      attempt.providerConfigId !== input.providerConfigId
    )
      throw new Error("GENERATION_ATTEMPT_SCOPE_MISMATCH");
    return attempt;
  }

  async get(attemptId: string): Promise<AttemptRecord | undefined> {
    const rows = await this.db.query("select * from app.get_generation_attempt($1)", [attemptId]);
    return mapAttempt(rows[0]);
  }

  async transition(input: AttemptTransition): Promise<AttemptRecord> {
    const rows = await this.db.query("select * from app.transition_generation_attempt($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
      input.attemptId,
      input.expectedState,
      input.nextState,
      input.externalId ?? null,
      input.cancellationState ?? null,
      input.sendCheckpoint ?? null,
      input.evidence.kind,
      input.evidence.observedAt,
      input.evidence.evidenceHash,
    ]);
    const result = mapAttempt(rows[0]);
    if (!result) throw new Error("GENERATION_ATTEMPT_CAS_MISMATCH");
    return result;
  }

  async beginCancellation(operationKey: string, attemptId: string): Promise<CancellationBegin> {
    const rows = await this.db.query("select * from app.begin_generation_cancellation($1,$2)", [
      operationKey,
      attemptId,
    ]);
    const row = rows[0];
    if (!row || (row["disposition"] !== "invoke" && row["disposition"] !== "existing"))
      throw new Error("CANCELLATION_OPERATION_RESULT_MISSING");
    if (row["disposition"] === "invoke") return { disposition: "invoke" };
    return {
      disposition: "existing",
      receipt: mapCancellationReceipt(operationKey, attemptId, row),
    };
  }

  async completeCancellation(input: CancellationCompletion): Promise<CancellationReceiptRecord> {
    const rows = await this.db.query("select * from app.complete_generation_cancellation($1,$2,$3,$4,$5)", [
      input.operationKey,
      input.attemptId,
      input.cancellationState,
      input.terminalStatus ?? null,
      input.evidenceHash,
    ]);
    if (!rows[0]) throw new Error("CANCELLATION_OPERATION_RESULT_MISSING");
    return mapCancellationReceipt(input.operationKey, input.attemptId, rows[0]);
  }

  async markCancellationInvokeStarted(operationKey: string, attemptId: string): Promise<CancellationInvokeStart> {
    const rows = await this.db.query("select * from app.mark_generation_cancellation_invoke_started($1,$2)", [
      operationKey,
      attemptId,
    ]);
    return mapCancellationDisposition(operationKey, attemptId, rows[0]);
  }

  async createReplacementFromAbsenceEvidence(
    previousAttemptId: string,
    submissionKey: string,
    evidence: AuthoritativeAbsenceEvidence,
  ): Promise<AttemptRecord> {
    const rows = await this.db.query("select * from app.create_replacement_generation_attempt($1,$2,$3,$4,$5,$6)", [
      previousAttemptId,
      submissionKey,
      evidence.providerConfigId,
      evidence.submissionKey,
      evidence.observedAt,
      evidence.evidenceHash,
    ]);
    const result = mapAttempt(rows[0]);
    if (!result) throw new Error("GENERATION_REPLACEMENT_ATTEMPT_RESULT_MISSING");
    return result;
  }
}

function mapCancellationDisposition(
  operationKey: string,
  attemptId: string,
  row: Record<string, unknown> | undefined,
): CancellationInvokeStart {
  if (!row || (row["disposition"] !== "invoke" && row["disposition"] !== "existing"))
    throw new Error("CANCELLATION_OPERATION_RESULT_MISSING");
  if (row["disposition"] === "invoke") return { disposition: "invoke" };
  return { disposition: "existing", receipt: mapCancellationReceipt(operationKey, attemptId, row) };
}

function mapAttempt(value: Record<string, unknown> | undefined): AttemptRecord | undefined {
  if (!value?.["attempt_id"]) return undefined;
  return {
    attemptId: String(value["attempt_id"]),
    billableAttemptId: String(value["billable_attempt_id"]),
    tenantId: String(value["tenant_id"]),
    projectId: String(value["project_id"]),
    jobId: String(value["job_id"]),
    providerConfigId: String(value["provider_config_id"]),
    submissionKey: String(value["submission_key"]),
    state: value["state"] as AttemptRecord["state"],
    externalId:
      value["external_id"] === null || value["external_id"] === undefined ? null : String(value["external_id"]),
    cancellationState: value["cancellation_state"] as AttemptRecord["cancellationState"],
    sendCheckpoint: value["send_checkpoint"] as AttemptRecord["sendCheckpoint"],
  };
}

function mapCancellationReceipt(
  operationKey: string,
  attemptId: string,
  row: Record<string, unknown>,
): CancellationReceiptRecord {
  return {
    operationKey,
    attemptId,
    cancellationState: row["cancellation_state"] as CancellationReceiptRecord["cancellationState"],
    ...(row["terminal_status"]
      ? { terminalStatus: row["terminal_status"] as NonNullable<CancellationReceiptRecord["terminalStatus"]> }
      : {}),
  };
}
