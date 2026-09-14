import type { DbClient } from "./client.js";

const tenantScopeBrand: unique symbol = Symbol("VerifiedTenantScope");
const projectScopeBrand: unique symbol = Symbol("VerifiedProjectScope");

export type VerifiedTenantScope = Readonly<{
  tenantId: string;
  subject: string;
  requestId: string;
  nonce: string;
  [tenantScopeBrand]: true;
}>;

export type VerifiedProjectScope = VerifiedTenantScope &
  Readonly<{
    projectId: string;
    [projectScopeBrand]: true;
  }>;

export function createVerifiedTenantScopeForDbBootstrap(input: {
  tenantId: string;
  subject: string;
  requestId: string;
  nonce: string;
}): VerifiedTenantScope {
  return { ...input, [tenantScopeBrand]: true };
}

export function createVerifiedProjectScopeForDbBootstrap(
  input: VerifiedTenantScope & { projectId: string },
): VerifiedProjectScope {
  return { ...input, [projectScopeBrand]: true };
}

export async function withTenantTransaction<T>(
  db: DbClient,
  tenantScope: VerifiedTenantScope,
  fn: (tx: DbClient, scope: VerifiedTenantScope) => Promise<T>,
): Promise<T> {
  await setTenantContextInternal(db, tenantScope.tenantId);
  return fn(db, tenantScope);
}

export async function withProjectTransaction<T>(
  db: DbClient,
  projectScope: VerifiedProjectScope,
  fn: (tx: DbClient, scope: VerifiedProjectScope) => Promise<T>,
): Promise<T> {
  await setTenantContextInternal(db, projectScope.tenantId);
  await setProjectContextInternal(db, projectScope.projectId);
  return fn(db, projectScope);
}

async function setTenantContextInternal(db: DbClient, tenantId: string) {
  await db.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
}

async function setProjectContextInternal(db: DbClient, projectId: string) {
  await db.query("select set_config('app.project_id', $1, true)", [projectId]);
}
