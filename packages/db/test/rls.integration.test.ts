import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("migrations/0001_identity.sql", "utf8").toLowerCase();

describe("RLS migration contract", () => {
  it("forces RLS on every tenant table and uses app tenant context", () => {
    for (const table of [
      "tenants",
      "users",
      "memberships",
      "projects",
      "project_memberships",
      "project_policies",
      "beta_access_entries",
    ]) {
      expect(sql).toContain(`alter table app.${table} enable row level security`);
      expect(sql).toContain(`alter table app.${table} force row level security`);
    }
    expect(sql).toContain("current_setting('app.tenant_id', true)");
  });
});
