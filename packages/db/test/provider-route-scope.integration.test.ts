import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { dbSchemas, modelsSchema } from "../src/schema/index.js";

describe("provider route scope contract", () => {
  const migration = readFileSync("migrations/0007_model_catalog.sql", "utf8").toLowerCase();

  it("registers model catalog tables in schema introspection", () => {
    expect(dbSchemas.schemaVersion).toBeGreaterThanOrEqual(7);
    expect(dbSchemas.tables).toEqual(expect.arrayContaining(modelsSchema.tables));
  });

  it("uses a narrow security-definer pre-signature webhook route", () => {
    expect(migration).toContain(
      "create or replace function app.route_provider_webhook(providerkey text, routetoken text)",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("current_user <> 'comic_api'");
    expect(migration).toContain("provider_config_id text, webhook_verification_secret_ref text");
    expect(migration).toContain("from app.provider_configs");
    expect(migration).toContain("limit 1");
    expect(migration).not.toContain("tenant_id");
    expect(migration).not.toContain("project_id");
    expect(migration).not.toContain("attempt");
    expect(migration).toContain("revoke all on function app.route_provider_webhook(text, text) from public");
    expect(migration).toContain("grant execute on function app.route_provider_webhook(text, text) to comic_api");
  });

  it("does not expose submit credentials or direct provider config reads", () => {
    const functionBody = migration.split("create or replace function app.route_provider_webhook")[1] ?? "";
    expect(functionBody).not.toContain("generation_submit_secret_ref");
    expect(functionBody).toContain("webhook_verification_secret_ref");
    expect(migration).toContain("provider_webhook_route_forbidden");
    expect(migration).toContain("provider_webhook_route_not_found");
    expect(migration).toContain("revoke all on table app.provider_configs from public");
    expect(migration).not.toContain("grant select on table app.provider_configs");
  });
});
