import type { DbClient } from "./client.js";
import type { VerifiedProjectScope, VerifiedTenantScope } from "./verified-scope.js";

export async function setLocalTenantContext(db: DbClient, scope: VerifiedTenantScope) {
  await db.query("select set_config('app.tenant_id', $1, true)", [scope.tenantId]);
}

export async function setLocalProjectContext(db: DbClient, scope: VerifiedProjectScope) {
  await db.query("select set_config('app.project_id', $1, true)", [scope.projectId]);
}
