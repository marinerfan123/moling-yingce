import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("security owner contract", () => {
  it("keeps security owner no-login and bootstrap functions locked down", () => {
    const initRoles = readFileSync("../../infra/docker/postgres/init-roles.sql", "utf8").toLowerCase();
    const migration = readFileSync("migrations/0001_identity.sql", "utf8").toLowerCase();
    expect(initRoles).toContain("comic_security_owner nologin noinherit bypassrls");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("revoke all on function app.bootstrap_http_tenant_scope");
  });
});
