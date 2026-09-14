import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const billingSql = readFileSync("migrations/0008_billing.sql", "utf8");
const generationSql = readFileSync("migrations/0009_generation.sql", "utf8");
const outboxSql = readFileSync("migrations/0002_idempotency_audit.sql", "utf8");

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function app.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf("$$;", start));
}

describe("durable generation work billing binding", () => {
  it("creates the attempt, billable subject, reservation, outbox event and immutable binding atomically", () => {
    const creation = functionBody(generationSql, "create_generation_attempt_work");

    expect(generationSql).toContain("check (outbox_tenant_id = tenant_id::uuid)");
    expect(generationSql).toContain(
      "foreign key (outbox_tenant_id, outbox_event_id) references app.outbox_events(tenant_id, id)",
    );
    expect(creation).toContain("insert into app.billable_attempts");
    expect(creation).toContain("perform app.reserve_usage");
    expect(creation).toContain("insert into app.outbox_events");
    expect(creation).toContain("'generation.submit'");
    expect(creation).toContain("insert into app.generation_attempts");
    expect(creation).toContain("insert into app.generation_work_bindings");
    expect(creation).toContain("returns table(event_id uuid, route text, payload_hash text)");
    expect(creation).not.toContain("claim_token");
  });

  it("authorizes claimed, published, terminal and expired-lease work without a rotating claim token", () => {
    const charge = functionBody(billingSql, "record_attempt_charge");
    const claim = functionBody(outboxSql, "claim_outbox");

    expect(claim).toContain("claim_token = pg_catalog.encode(public.gen_random_bytes(16), 'hex')");
    expect(charge).toContain("event.state in ('claimed', 'published', 'terminal')");
    expect(charge).not.toContain("claimToken");
    expect(charge).not.toContain("claim_token_hash");
    expect(charge).not.toContain("lease_until");
  });

  it("rejects pending and a wrong event, payload hash, or route", () => {
    const charge = functionBody(billingSql, "record_attempt_charge");

    expect(charge).toContain("binding.outbox_event_id = eventId");
    expect(charge).toContain("binding.payload_hash = workPayloadHash");
    expect(charge).toContain("binding.route = 'generation.submit'");
    expect(charge).toContain("event.route = binding.route");
    expect(charge).toContain("event.payload_hash = binding.payload_hash");
    expect(charge).not.toContain("'pending'");
  });
});
