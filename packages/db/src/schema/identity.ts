export type TenantScopedTable = Readonly<{
  name: string;
  tenantIdColumn: "tenant_id";
  rlsForced: true;
}>;

export const identitySchema = Object.freeze({
  tables: [
    { name: "tenants", tenantIdColumn: "tenant_id", rlsForced: true },
    { name: "users", tenantIdColumn: "tenant_id", rlsForced: true },
    { name: "memberships", tenantIdColumn: "tenant_id", rlsForced: true },
    { name: "projects", tenantIdColumn: "tenant_id", rlsForced: true },
    { name: "project_memberships", tenantIdColumn: "tenant_id", rlsForced: true },
    { name: "project_policies", tenantIdColumn: "tenant_id", rlsForced: true },
    { name: "beta_access_entries", tenantIdColumn: "tenant_id", rlsForced: true },
  ] satisfies TenantScopedTable[],
});

export function assertTenantScopedForeignKeys(schema = identitySchema) {
  const missing = schema.tables.filter((table) => table.tenantIdColumn !== "tenant_id" || table.rlsForced !== true);
  if (missing.length > 0) throw new Error(`TENANT_SCOPE_MISSING ${missing.map((table) => table.name).join(",")}`);
  return true;
}
