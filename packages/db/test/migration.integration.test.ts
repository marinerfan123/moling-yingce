import { describe, expect, it } from "vitest";
import {
  verifyCanvasCollabMigration,
  verifyIdentityMigration,
  verifyIdempotencyAuditMigration,
  verifyBillingMigration,
  verifyGenerationMigration,
  verifyModelCatalogMigration,
  verifyProjectsMigration,
  verifyRightsModerationMigration,
} from "../src/migrator.js";
import { assertTenantScopedForeignKeys, dbSchemas } from "../src/index.js";

describe("identity migration", () => {
  it("contains required identity tables, RLS and bootstrap functions", () => {
    expect(verifyIdentityMigration()).toEqual({ checked: 9 });
    expect(dbSchemas.tables).toContain("projects");
    expect(assertTenantScopedForeignKeys()).toBe(true);
  });

  it("contains required idempotency, audit and outbox tables/functions", () => {
    expect(verifyIdempotencyAuditMigration()).toEqual({ checked: 11 });
    expect(dbSchemas.tables).toContain("idempotency_keys");
    expect(dbSchemas.tables).toContain("outbox_events");
  });

  it("contains required project, episode, canvas and narrative lifecycle tables", () => {
    expect(verifyProjectsMigration()).toEqual({ checked: 21 });
    expect(dbSchemas.schemaVersion).toBeGreaterThanOrEqual(3);
    expect(dbSchemas.tables).toContain("episodes");
    expect(dbSchemas.tables).toContain("script_revisions");
    expect(dbSchemas.tables).toContain("episode_copy_policy_catalog");
  });

  it("contains immutable rights, moderation, disclosure and remote ingest tables", () => {
    expect(verifyRightsModerationMigration()).toEqual({ checked: 13 });
    expect(dbSchemas.schemaVersion).toBeGreaterThanOrEqual(4);
    expect(dbSchemas.tables).toContain("rights_records");
    expect(dbSchemas.tables).toContain("remote_ingest_instructions");
  });

  it("contains durable canvas collab lease, revision and projection tables", () => {
    expect(verifyCanvasCollabMigration()).toEqual({ checked: 13 });
    expect(dbSchemas.schemaVersion).toBeGreaterThanOrEqual(6);
    expect(dbSchemas.tables).toContain("canvas_room_leases");
    expect(dbSchemas.tables).toContain("canvas_projection_receipts");
  });

  it("contains provider model catalog and narrow webhook route lookup", () => {
    expect(verifyModelCatalogMigration()).toEqual({ checked: 16 });
    expect(dbSchemas.schemaVersion).toBeGreaterThanOrEqual(7);
    expect(dbSchemas.tables).toContain("provider_configs");
    expect(dbSchemas.tables).toContain("model_catalog");
  });

  it("contains integer billing budget, reservation and append-only ledger tables", () => {
    expect(verifyBillingMigration()).toEqual({ checked: 62 });
    expect(dbSchemas.schemaVersion).toBeGreaterThanOrEqual(8);
    expect(dbSchemas.tables).toContain("billing_budgets");
    expect(dbSchemas.tables).toContain("usage_reservations");
    expect(dbSchemas.tables).toContain("attempt_charges");
  });

  it("contains durable generation jobs, selections and post-signature provider bootstrap", () => {
    expect(verifyGenerationMigration()).toEqual({ checked: 66 });
    expect(dbSchemas.schemaVersion).toBeGreaterThanOrEqual(9);
    expect(dbSchemas.tables).toContain("generation_jobs");
    expect(dbSchemas.tables).toContain("generation_attempts");
    expect(dbSchemas.tables).toContain("generation_work_bindings");
    expect(dbSchemas.tables).toContain("provider_webhook_receipts");
    expect(dbSchemas.tables).toContain("selections");
  });
});
