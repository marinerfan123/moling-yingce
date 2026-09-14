import type { DbClient } from "./client.js";
import type { VerifiedProjectScope } from "./verified-scope.js";

export async function withProjectWriteFence<T>(
  db: DbClient,
  projectScope: VerifiedProjectScope,
  fn: (fenced: { tenantId: string; projectId: string; fenceToken: string }) => Promise<T>,
) {
  await db.query("select pg_advisory_xact_lock(hashtext($1))", [`${projectScope.tenantId}:${projectScope.projectId}`]);
  return fn({
    tenantId: projectScope.tenantId,
    projectId: projectScope.projectId,
    fenceToken: `${projectScope.tenantId}:${projectScope.projectId}:${projectScope.requestId}`,
  });
}
