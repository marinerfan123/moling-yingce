import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { bootstrapVerifiedProviderEvent, type DbClient } from "../src/index.js";
import { dbSchemas, generationSchema, selectionsSchema } from "../src/schema/index.js";

const sha = (char: string) => `sha256:${char.repeat(64)}`;

function createMockDb(role: DbClient["role"], rows: readonly unknown[] = []) {
  const calls: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
  const db: DbClient = {
    role,
    async query(sql, params) {
      calls.push({ sql, params });
      return rows;
    },
  };
  return { db, calls };
}

describe("verified provider event scope", () => {
  const migration = readFileSync("migrations/0009_generation.sql", "utf8").toLowerCase();

  it("registers generation and selection tables in schema introspection", () => {
    expect(dbSchemas.schemaVersion).toBeGreaterThanOrEqual(9);
    expect(dbSchemas.tables).toEqual(expect.arrayContaining(generationSchema.tables));
    expect(dbSchemas.tables).toEqual(expect.arrayContaining(selectionsSchema.tables));
  });

  it("keeps SQL provider bootstrap post-signature, replay-safe and attempt-derived", () => {
    expect(migration).toContain("create table app.provider_webhook_receipts");
    expect(migration).toContain("verifier_stage text not null check (verifier_stage = 'post_signature')");
    expect(migration).toContain("create or replace function app.bootstrap_verified_provider_event");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("session_user <> 'comic_api'");
    expect(migration).toContain("receipt.consumed_at is null");
    expect(migration).toContain("attempt.provider_config_id = receipt.provider_config_id");
    expect(migration).toContain("attempt.external_id = receipt.external_id");
    expect(migration).toContain("attempt.tenant_id = receipt.tenant_id");
    expect(migration).toContain("attempt.project_id = receipt.project_id");
    expect(migration).toContain("insert into app.provider_events");
    expect(migration).toContain("returns table(tenant_id text, project_id text, attempt_id text)");
    expect(migration).toContain("grant execute on function app.bootstrap_verified_provider_event");
    expect(migration).toContain(" to comic_api");
    expect(migration).not.toContain(" to comic_worker");
  });

  it("bootstraps a minimal project scope only after verified provider receipt matching attempt authority", async () => {
    const { db, calls } = createMockDb("api", [
      { tenant_id: "tenant_12345678", project_id: "project_12345678", attempt_id: "attempt_12345678" },
    ]);

    const scope = await bootstrapVerifiedProviderEvent(db, {
      providerConfigId: "providercfg_12345678",
      externalId: "external_12345678",
      externalEventId: "event_12345678",
      receiptId: "receipt_12345678",
      payloadHash: sha("a"),
      rawVerifierProofHash: sha("b"),
      requestId: "request_12345678",
    });

    expect(scope).toMatchObject({
      tenantId: "tenant_12345678",
      projectId: "project_12345678",
      subject: "provider-attempt:attempt_12345678",
      requestId: "request_12345678",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("app.bootstrap_verified_provider_event");
    expect(calls[0]?.params).toEqual([
      "providercfg_12345678",
      "external_12345678",
      "receipt_12345678",
      sha("a"),
      sha("b"),
      "event_12345678",
    ]);
  });

  it("returns no scope and writes no provider event for wrong role, pre-signature or malformed evidence", async () => {
    const wrongRole = createMockDb("generation-worker", [
      { tenant_id: "tenant_12345678", project_id: "project_12345678", attempt_id: "attempt_12345678" },
    ]);
    await expect(
      bootstrapVerifiedProviderEvent(wrongRole.db, {
        providerConfigId: "providercfg_12345678",
        externalId: "external_12345678",
        externalEventId: "event_12345678",
        receiptId: "receipt_12345678",
        payloadHash: sha("a"),
        rawVerifierProofHash: sha("b"),
        requestId: "request_12345678",
      }),
    ).resolves.toBeNull();
    expect(wrongRole.calls).toHaveLength(0);

    const preSignature = createMockDb("api", [
      { tenant_id: "tenant_12345678", project_id: "project_12345678", attempt_id: "attempt_12345678" },
    ]);
    await expect(
      bootstrapVerifiedProviderEvent(preSignature.db, {
        providerConfigId: "providercfg_12345678",
        externalId: "external_12345678",
        externalEventId: "event_12345678",
        receiptId: "receipt_12345678",
        payloadHash: sha("a"),
        rawVerifierProofHash: "pre-signature-proof",
        requestId: "request_12345678",
      }),
    ).resolves.toBeNull();
    expect(preSignature.calls).toHaveLength(0);
  });

  it("returns no scope when SQL bootstrap rejects spoof, replay, externalId or payload mismatch", async () => {
    const { db, calls } = createMockDb("api", []);

    await expect(
      bootstrapVerifiedProviderEvent(db, {
        providerConfigId: "providercfg_12345678",
        externalId: "spoofed_external",
        externalEventId: "event_replayed",
        receiptId: "receipt_replayed",
        payloadHash: sha("c"),
        rawVerifierProofHash: sha("d"),
        requestId: "request_12345678",
      }),
    ).resolves.toBeNull();
    expect(calls).toHaveLength(1);
  });
});
