import { describe, expect, it } from "vitest";

import { PostgresAttemptRepository } from "../src/postgres-attempt-repository.js";

describe("PostgresAttemptRepository", () => {
  it("maps CAS transitions and append-only evidence to one database function", async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const repository = new PostgresAttemptRepository({
      async query(sql, params) {
        calls.push({ sql, params });
        return [
          {
            attempt_id: "attempt_12345678",
            billable_attempt_id: "attempt_billable_12345678",
            tenant_id: "tenant_12345678",
            project_id: "project_12345678",
            job_id: "job_12345678",
            provider_config_id: "providercfg_12345678",
            submission_key: "submission_12345678",
            state: "reconciling",
            external_id: null,
            cancellation_state: "none",
            send_checkpoint: "possibly_sent",
          },
        ];
      },
    });

    const result = await repository.transition({
      attemptId: "attempt_12345678",
      expectedState: "submitted",
      nextState: "reconciling",
      sendCheckpoint: "possibly_sent",
      evidence: {
        kind: "submit_transport_ambiguous",
        observedAt: "2026-08-28T00:00:00.000Z",
        evidenceHash: `sha256:${"a".repeat(64)}`,
      },
    });

    expect(result).toMatchObject({ state: "reconciling", sendCheckpoint: "possibly_sent" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("app.transition_generation_attempt");
    expect(calls[0]?.params).toEqual([
      "attempt_12345678",
      "submitted",
      "reconciling",
      null,
      null,
      "possibly_sent",
      "submit_transport_ambiguous",
      "2026-08-28T00:00:00.000Z",
      `sha256:${"a".repeat(64)}`,
    ]);
  });

  it("uses durable cancellation begin/complete functions and never relies on process memory", async () => {
    const calls: string[] = [];
    const repository = new PostgresAttemptRepository({
      async query(sql) {
        calls.push(sql);
        if (sql.includes("begin_generation_cancellation")) {
          return [{ disposition: "invoke", cancellation_state: "requested", terminal_status: null }];
        }
        return [{ disposition: "completed", cancellation_state: "unknown", terminal_status: null }];
      },
    });

    await expect(repository.beginCancellation("cancelop_12345678", "attempt_12345678")).resolves.toMatchObject({
      disposition: "invoke",
    });
    await expect(
      repository.completeCancellation({
        operationKey: "cancelop_12345678",
        attemptId: "attempt_12345678",
        cancellationState: "unknown",
        evidenceHash: `sha256:${"b".repeat(64)}`,
      }),
    ).resolves.toMatchObject({ cancellationState: "unknown" });
    expect(calls).toEqual([
      expect.stringContaining("app.begin_generation_cancellation"),
      expect.stringContaining("app.complete_generation_cancellation"),
    ]);
  });
});
