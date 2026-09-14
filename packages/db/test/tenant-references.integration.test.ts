import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tenant references", () => {
  it("uses composite tenant foreign keys for tenant-owned relations", () => {
    const sql = readFileSync("migrations/0001_identity.sql", "utf8").toLowerCase();
    expect(sql.match(/foreign key \(tenant_id,/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).not.toContain("references app.projects (id)");
  });
});
