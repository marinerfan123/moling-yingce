import { describe, expect, it } from "vitest";
import {
  bootstrapHttpProjectScope,
  bootstrapHttpTenantScope,
  createDbClient,
  withProjectTransaction,
  withTenantTransaction,
} from "../src/index.js";

describe("scope boundary", () => {
  it("bootstraps tenant and project scopes before transaction helpers can run", async () => {
    const db = createDbClient("api");
    const tenantScope = await bootstrapHttpTenantScope(db, {
      issuer: "https://issuer.example",
      subject: "user-1",
      verifiedTenantClaim: "tenant-1",
      requestId: "req-1",
    });
    await expect(withTenantTransaction(db, tenantScope, async (_tx, scope) => scope.tenantId)).resolves.toBe(
      "tenant-1",
    );
    const projectScope = await bootstrapHttpProjectScope(db, tenantScope, "project-1", "req-1");
    await expect(withProjectTransaction(db, projectScope, async (_tx, scope) => scope.projectId)).resolves.toBe(
      "project-1",
    );
  });

  it("rejects unverified tenant and project scope inputs", async () => {
    const db = createDbClient("api");
    await expect(
      bootstrapHttpTenantScope(db, { issuer: "", subject: "s", verifiedTenantClaim: "tenant-1", requestId: "req" }),
    ).rejects.toThrow(/TENANT_SCOPE_UNVERIFIED/);
  });
});
