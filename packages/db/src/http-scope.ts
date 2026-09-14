import type { DbClient } from "./client.js";
import {
  createVerifiedProjectScopeForDbBootstrap,
  createVerifiedTenantScopeForDbBootstrap,
  type VerifiedProjectScope,
  type VerifiedTenantScope,
} from "./verified-scope.js";

export async function bootstrapHttpTenantScope(
  db: DbClient,
  input: { issuer: string; subject: string; verifiedTenantClaim: string; requestId: string },
): Promise<VerifiedTenantScope> {
  if (!input.issuer || !input.subject || !input.verifiedTenantClaim) throw new Error("TENANT_SCOPE_UNVERIFIED");
  await db.query("select app.bootstrap_http_tenant_scope($1,$2,$3,$4)", [
    input.issuer,
    input.subject,
    input.verifiedTenantClaim,
    input.requestId,
  ]);
  return createVerifiedTenantScopeForDbBootstrap({
    tenantId: input.verifiedTenantClaim,
    subject: input.subject,
    requestId: input.requestId,
    nonce: `tenant_scope_${input.requestId}`,
  });
}

export async function bootstrapHttpProjectScope(
  db: DbClient,
  tenantScope: VerifiedTenantScope,
  projectId: string,
  requestId: string,
): Promise<VerifiedProjectScope> {
  if (!projectId) throw new Error("PROJECT_SCOPE_UNVERIFIED");
  await db.query("select app.bootstrap_http_project_scope($1,$2,$3)", [tenantScope.nonce, projectId, requestId]);
  return createVerifiedProjectScopeForDbBootstrap({ ...tenantScope, projectId });
}
