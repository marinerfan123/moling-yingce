import { describe, expect, it } from "vitest";

import { withProjectWriteFence } from "../src/project-fence.js";
import {
  createVerifiedProjectScopeForDbBootstrap,
  createVerifiedTenantScopeForDbBootstrap,
} from "../src/verified-scope.js";

describe("project write fence", () => {
  it("uses one tenant/project advisory fence for domain writes", async () => {
    const queries: unknown[] = [];
    const tenant = createVerifiedTenantScopeForDbBootstrap({
      tenantId: "tenant_12345678",
      subject: "user_12345678",
      requestId: "req_1",
      nonce: "n",
    });
    const scope = createVerifiedProjectScopeForDbBootstrap({ ...tenant, projectId: "project_12345678" });
    const result = await withProjectWriteFence(
      { query: async (...args: unknown[]) => void queries.push(args) },
      scope,
      async (fence) => fence,
    );
    expect(result.fenceToken).toContain("project_12345678");
    expect(JSON.stringify(queries)).toContain("pg_advisory_xact_lock");
  });
});
