import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("migrations/0009_generation.sql", "utf8").toLowerCase();

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function app.${name}`);
  const end = migration.indexOf("\n$$;", start);
  return migration.slice(start, end);
}

describe("durable generation attempt state machine migration", () => {
  it("persists fenced send checkpoints and append-only provider evidence", () => {
    expect(migration).toContain("send_checkpoint text not null");
    expect(migration).toContain("definitely_not_sent");
    expect(migration).toContain("possibly_sent");
    expect(migration).toContain("bytes_started");
    expect(migration).toContain("create table app.generation_attempt_evidence");
    expect(migration).toContain("create trigger generation_attempt_evidence_immutable");
    expect(migration).toContain("create or replace function app.transition_generation_attempt");
    expect(migration).toContain("expectedstate text");
    expect(migration).toContain("attempt.state <> expectedstate");
    expect(migration).toContain("late_terminal_conflict");
  });

  it("persists restart-safe cancellation claims bound to one attempt and scope", () => {
    expect(migration).toContain("attempt_id text not null");
    expect(migration).toContain("provider_config_id text not null");
    expect(migration).toContain("create or replace function app.begin_generation_cancellation");
    expect(migration).toContain("create or replace function app.complete_generation_cancellation");
    expect(migration).toContain("create or replace function app.mark_generation_cancellation_invoke_started");
    expect(migration).toContain("provider_call_state");
    expect(migration).toContain("provider_call_state = 'not_invoked'");
    expect(migration).toContain("possibly_invoked");
    expect(migration).toContain("cancellation_operation_scope_mismatch");
    expect(migration).toMatch(/pg_catalog\.encode\(\s*public\.digest\(/);
  });

  it("atomically consumes fully-bound authoritative absence evidence for replacement", () => {
    const replacement = functionBody("create_replacement_generation_attempt");
    expect(migration).toContain("create table app.generation_absence_evidence_consumptions");
    expect(migration).toContain("previous_attempt_id");
    expect(migration).toContain("provider_config_id");
    expect(migration).toContain("submission_key");
    expect(migration).toContain("observed_at");
    expect(migration).toContain("evidence_hash");
    expect(migration).toContain("create or replace function app.create_replacement_generation_attempt");
    expect(replacement).toContain("from app.generation_jobs replacement_job");
    expect(replacement).toContain("for update of replacement_job");
    expect(replacement).toContain("insert into app.outbox_events");
    expect(replacement).toContain("insert into app.generation_work_bindings");
    expect(replacement).not.toContain("exception when unique_violation then");
    expect(migration).toContain("generation_absence_evidence_already_consumed");
  });

  it("qualifies RETURNS TABLE output names and pgcrypto calls under an empty search_path", () => {
    const cancellation = functionBody("begin_generation_cancellation");
    const replacement = functionBody("create_replacement_generation_attempt");
    expect(migration).toContain("stored_receipt.state = 'claimed'");
    expect(migration).toContain("pg_catalog.encode(public.gen_random_bytes(16), 'hex')");
    expect(cancellation).toContain("generation_job.cancellation_state = 'none'");
    expect(replacement).toContain("candidate_attempt.tenant_id = previousattempt.tenant_id");
    expect(replacement).toContain("reservation.project_id = previousattempt.project_id");
    expect(replacement).toContain("billable_attempt.id = previousattempt.billable_attempt_id");
    expect(migration).not.toMatch(/(?<!pg_catalog\.)\bencode\s*\(/);
    expect(migration).not.toMatch(/(?<!public\.)\bdigest\s*\(/);
  });
});
