import { describe, expect, it } from "vitest";
import { runIdempotentCommand } from "../src/idempotent-command.js";

const base = {
  tenantId: "tenant_1",
  actorId: "actor_1",
  operation: "project.create",
  key: "idem-1",
  method: "POST",
  pathParams: { projectId: "p1" },
  semanticQuery: { b: 2, a: 1 },
  body: { name: "A", nested: { z: 1, a: 2 } },
};

describe("runIdempotentCommand", () => {
  it("replays byte-equivalent responses and runs one mutation", async () => {
    let mutations = 0;
    const first = await runIdempotentCommand({ traceId: "trace_12345678" }, base, async () => {
      mutations += 1;
      return { status: 201, body: { ok: true } };
    });
    const second = await runIdempotentCommand(
      { traceId: "trace_12345678" },
      { ...base, body: { nested: { a: 2, z: 1 }, name: "A" } },
      async () => {
        mutations += 1;
        return { status: 201, body: { ok: false } };
      },
    );
    expect(second).toEqual(first);
    expect(mutations).toBe(1);
  });

  it("returns deterministic 409 for semantic mismatches", async () => {
    await runIdempotentCommand({ traceId: "trace_22345678" }, { ...base, key: "idem-2" }, async () => ({
      status: 201,
      body: { ok: true },
    }));
    await expect(
      runIdempotentCommand(
        { traceId: "trace_22345678" },
        { ...base, key: "idem-2", pathParams: { projectId: "different" } },
        async () => ({
          status: 201,
          body: { ok: false },
        }),
      ),
    ).resolves.toMatchObject({ status: 409, body: { error: { code: "IDEMPOTENCY_PAYLOAD_MISMATCH" } } });
  });
});
