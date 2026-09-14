import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dbSchemas } from "../src/index.js";

const sql = readFileSync("migrations/0006_assets_uploads.sql", "utf8").toLowerCase();

describe("asset schema migration", () => {
  it("catalogs immutable asset tables and force-RLS boundaries", () => {
    expect(dbSchemas.schemaVersion).toBeGreaterThanOrEqual(6);
    for (const table of [
      "assets",
      "asset_versions",
      "asset_variants",
      "upload_sessions",
      "remote_ingest_instructions",
    ]) {
      expect(dbSchemas.tables).toContain(table);
      expect(sql).toContain(`alter table app.${table} force row level security`);
    }
  });

  it("protects version bytes and keeps remote locators out of queue payloads", () => {
    expect(sql).toContain("reject_asset_version_mutation");
    expect(sql).toContain("reject_remote_ingest_request_mutation");
    expect(sql).toContain("request_sha256");
    expect(sql).toContain("never copy locator into queues");
  });
});
