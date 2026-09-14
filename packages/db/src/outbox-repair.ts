export type RequeueOutboxRequest = Readonly<{
  eventId: string;
  expectedAttempt: number;
  reason: string;
  dryRun?: boolean;
}>;

export function requeueOutbox(request: RequeueOutboxRequest) {
  if (!request.eventId) throw new Error("REQUEUE_EVENT_ID_REQUIRED");
  if (!request.reason) throw new Error("REQUEUE_REASON_REQUIRED");
  if (!Number.isInteger(request.expectedAttempt) || request.expectedAttempt < 0)
    throw new Error("REQUEUE_EXPECTED_ATTEMPT_INVALID");
  return {
    auditId: `audit_${request.eventId}_${request.expectedAttempt}`,
    dryRun: request.dryRun ?? true,
  };
}
