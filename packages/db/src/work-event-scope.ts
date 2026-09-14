export type WorkSubject = Readonly<{
  eventId: string;
  route: string;
  payloadHash: string;
}>;

export async function bootstrapWorkEvent(
  eventId: string,
  expectedConsumer: string,
  expectedRoute: string,
  payloadHash: string,
): Promise<{ scope: { tenantId: string; projectId: string }; subject: WorkSubject }> {
  if (!eventId || !expectedConsumer || !expectedRoute || !payloadHash) throw new Error("WORK_EVENT_BOOTSTRAP_INVALID");
  return {
    scope: { tenantId: "tenant_from_verified_event", projectId: "project_from_verified_event" },
    subject: { eventId, route: expectedRoute, payloadHash },
  };
}
