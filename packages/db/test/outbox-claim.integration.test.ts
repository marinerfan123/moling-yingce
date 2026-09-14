import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("outbox claim migration", () => {
  it("declares claim state, leases and dispatcher-only function", () => {
    const sql = readFileSync("migrations/0002_idempotency_audit.sql", "utf8").toLowerCase();
    expect(sql).toContain("create table app.outbox_events");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("grant execute on function app.claim_outbox");
    expect(sql).toContain("to comic_dispatcher");
  });
});
