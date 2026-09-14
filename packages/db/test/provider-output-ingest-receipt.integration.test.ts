import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("provider-output ingest receipt migration", () => {
  it("uses a durable claim/complete state machine with deterministic quarantine keys", () => {
    const sql = readFileSync("migrations/0009_generation.sql", "utf8").toLowerCase();
    expect(sql).toContain("create table app.provider_output_ingest_receipts");
    expect(sql).toContain("quarantine_key text not null unique");
    expect(sql).toContain("lease_until timestamptz");
    expect(sql).toContain("claim_token text");
    expect(sql).toContain("create or replace function app.claim_provider_output_ingest");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("'quarantine/provider-output/' || p_instruction_id");
    expect(sql).toContain("lease_until >= now()");
    expect(sql).toContain("claim_token = pg_catalog.encode(public.gen_random_bytes(16), 'hex')");
    expect(sql).toContain("create or replace function app.complete_provider_output_ingest");
    expect(sql).toContain("create or replace function app.fail_provider_output_ingest");
    expect(sql).toContain("claim_token = p_claim_token");
    expect(sql).toContain("grant execute on function app.claim_provider_output_ingest");
  });
});
