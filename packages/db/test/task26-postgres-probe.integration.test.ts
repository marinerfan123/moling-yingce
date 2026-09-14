import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env["TASK26_POSTGRES_URL"];
const liveDescribe = databaseUrl ? describe.sequential : describe.skip;
const tenantId = "11111111-1111-4111-8111-111111111111";
const projectId = "project_task26_probe";
const observedAt = "2026-08-28T00:00:00.000Z";
const sha = (char: string) => `sha256:${char.repeat(64)}`;

liveDescribe("Task26 live PostgreSQL probe", () => {
  let pool: Pool;
  let generationSql: string;
  let billingSql: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, max: 8 });
    const fixture = await readFile("test/fixtures/task26-minimal-postgres.sql", "utf8");
    generationSql = await readFile("migrations/0009_generation.sql", "utf8");
    billingSql = await readFile("migrations/0008_billing.sql", "utf8");
    await pool.query(fixture);
    for (const name of [
      "get_generation_attempt",
      "get_generation_attempt_by_submission_key",
      "transition_generation_attempt",
      "begin_generation_cancellation",
      "mark_generation_cancellation_invoke_started",
      "complete_generation_cancellation",
      "create_replacement_generation_attempt",
      "claim_provider_output_ingest",
      "complete_provider_output_ingest",
      "fail_provider_output_ingest",
    ]) {
      await pool.query(functionSql(generationSql, name));
    }
    await pool.query(functionSql(billingSql, "record_attempt_charge"));
    await pool.query(
      "grant usage on schema app to comic_generation_worker, comic_media_worker; grant execute on all functions in schema app to comic_generation_worker, comic_media_worker",
    );
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("executes the RETURNS TABLE receipt function with an empty search_path", async () => {
    const client = await workerClient("comic_media_worker");
    try {
      const claimed = await client.query<{
        state: string;
        quarantine_key: string;
        claim_token: string;
      }>("select * from app.claim_provider_output_ingest($1)", ["instruction_task26"]);
      expect(claimed.rows[0]).toMatchObject({
        state: "claimed",
        quarantine_key: "quarantine/provider-output/instruction_task26",
      });
      expect(claimed.rows[0]?.claim_token).toMatch(/^[a-f0-9]{32}$/);
    } finally {
      await client.query("reset session authorization");
      client.release();
    }
  });

  it("distinguishes cancellation claim commit from provider invoke start and preserves late evidence", async () => {
    await seedAttempt("attempt_cancel", "billable_cancel", 1, "submission_cancel", "running", "external_cancel");
    const client = await workerClient("comic_generation_worker");
    try {
      const first = await client.query("select * from app.begin_generation_cancellation($1,$2)", [
        "cancel_operation",
        "attempt_cancel",
      ]);
      expect(first.rows[0]).toMatchObject({ disposition: "invoke", cancellation_state: "requested" });
      const replayBeforeInvoke = await client.query("select * from app.begin_generation_cancellation($1,$2)", [
        "cancel_operation",
        "attempt_cancel",
      ]);
      expect(replayBeforeInvoke.rows[0]).toMatchObject({ disposition: "invoke" });
      expect(
        (await pool.query("select provider_call_state from app.cancellation_operations where operation_key=$1", [
          "cancel_operation",
        ])).rows[0],
      ).toMatchObject({ provider_call_state: "not_invoked" });

      const started = await client.query("select * from app.mark_generation_cancellation_invoke_started($1,$2)", [
        "cancel_operation",
        "attempt_cancel",
      ]);
      expect(started.rows[0]).toMatchObject({ disposition: "invoke" });
      const replayAfterStart = await client.query("select * from app.begin_generation_cancellation($1,$2)", [
        "cancel_operation",
        "attempt_cancel",
      ]);
      expect(replayAfterStart.rows[0]).toMatchObject({ disposition: "existing", cancellation_state: "unknown" });

      await pool.query("update app.generation_attempts set state='succeeded' where id='attempt_cancel'");
      const completed = await client.query("select * from app.complete_generation_cancellation($1,$2,$3,$4,$5)", [
        "cancel_operation",
        "attempt_cancel",
        "acknowledged",
        "failed",
        sha("c"),
      ]);
      expect(completed.rows[0]).toMatchObject({ cancellation_state: "acknowledged", terminal_status: "failed" });
      expect((await pool.query("select state from app.generation_attempts where id='attempt_cancel'")).rows[0]).toEqual({
        state: "succeeded",
      });
      expect(
        (await pool.query("select kind from app.generation_attempt_evidence where evidence_hash=$1", [sha("c")])).rows[0],
      ).toEqual({ kind: "cancellation_acknowledged_late_terminal_conflict" });
    } finally {
      await client.query("reset session authorization");
      client.release();
    }
  });

  it("serializes replacement indexes, creates work bindings, and settles the replacement charge", async () => {
    await pool.query("insert into app.billing_currency_policies values ($1,$2,'USD')", [tenantId, projectId]);
    await pool.query(
      "insert into app.billing_budgets(tenant_id,project_id,currency,reserved_micros) values ($1,$2,'USD',1000)",
      [tenantId, projectId],
    );
    await seedAttempt("attempt_previous_a", "billable_previous_a", 2, "submission_previous_a", "reconciling", null);
    await seedAttempt("attempt_previous_b", "billable_previous_b", 3, "submission_previous_b", "reconciling", null);
    await pool.query(
      `insert into app.usage_reservations(tenant_id,project_id,id,job_id,attempt_id,amount_micros,currency)
       values ($1,$2,'reservation_a','job_probe','billable_previous_a',1000,'USD')`,
      [tenantId, projectId],
    );
    await pool.query("update app.generation_attempts set reservation_id='reservation_a' where id='attempt_previous_a'");
    await pool.query(
      `insert into app.generation_attempt_evidence(
         tenant_id,project_id,id,attempt_id,kind,previous_attempt_id,provider_config_id,submission_key,observed_at,evidence_hash
       ) values
         ($1,$2,'evidence_a','attempt_previous_a','recovery_definitively_absent','attempt_previous_a','provider_probe','submission_previous_a',$3,$4),
         ($1,$2,'evidence_b','attempt_previous_b','recovery_definitively_absent','attempt_previous_b','provider_probe','submission_previous_b',$3,$5)`,
      [tenantId, projectId, observedAt, sha("a"), sha("b")],
    );

    const [replacementA, replacementB] = await Promise.all([
      replaceAttempt("attempt_previous_a", "submission_replacement_a", "submission_previous_a", sha("a")),
      replaceAttempt("attempt_previous_b", "submission_replacement_b", "submission_previous_b", sha("b")),
    ]);
    const indexes = (
      await pool.query(
        "select attempt_index from app.generation_attempts where id=any($1::text[]) order by attempt_index",
        [[replacementA.attempt_id, replacementB.attempt_id]],
      )
    ).rows.map((row) => Number(row["attempt_index"]));
    expect(indexes).toEqual([4, 5]);
    expect(
      Number(
        (
          await pool.query(
            "select count(*) from app.generation_work_bindings where generation_attempt_id=any($1::text[])",
            [[replacementA.attempt_id, replacementB.attempt_id]],
          )
        ).rows[0]?.["count"],
      ),
    ).toBe(2);

    const binding = (
      await pool.query(
        `select binding.outbox_event_id, binding.payload_hash
         from app.generation_work_bindings binding where binding.generation_attempt_id=$1`,
        [replacementA.attempt_id],
      )
    ).rows[0]!;
    await pool.query("update app.outbox_events set state='claimed' where id=$1", [binding["outbox_event_id"]]);
    const client = await workerClient("comic_generation_worker");
    try {
      const charge = await client.query("select app.record_attempt_charge($1,$2,$3,$4,$5,$6,$7,$8) as id", [
        replacementA.attempt_id,
        binding["outbox_event_id"],
        binding["payload_hash"],
        "provider_charge_replacement_a",
        100,
        "USD",
        sha("d"),
        false,
      ]);
      expect(charge.rows[0]?.["id"]).toContain("ledger_charge_");
    } finally {
      await client.query("reset session authorization");
      client.release();
    }
    expect(
      (await pool.query("select attempt_id from app.usage_reservations where id='reservation_a'")).rows[0],
    ).toEqual({ attempt_id: replacementA.billable_attempt_id });
    expect(
      (await pool.query("select count(*) from app.attempt_charges where provider_charge_id=$1", [
        "provider_charge_replacement_a",
      ])).rows[0],
    ).toEqual({ count: "1" });
  }, 20_000);

  async function workerClient(role: "comic_generation_worker" | "comic_media_worker"): Promise<PoolClient> {
    const client = await pool.connect();
    await client.query(`set session authorization ${role}`);
    return client;
  }

  async function seedAttempt(
    attemptId: string,
    billableAttemptId: string,
    attemptIndex: number,
    submissionKey: string,
    state: string,
    externalId: string | null,
  ) {
    await pool.query(
      "insert into app.generation_jobs(tenant_id,project_id,id) values ($1,$2,'job_probe') on conflict do nothing",
      [tenantId, projectId],
    );
    await pool.query("insert into app.billable_attempts(tenant_id,project_id,id,job_id) values ($1,$2,$3,'job_probe')", [
      tenantId,
      projectId,
      billableAttemptId,
    ]);
    await pool.query(
      `insert into app.generation_attempts(
         tenant_id,project_id,id,job_id,billable_attempt_id,attempt_index,state,provider_config_id,external_id,
         submission_key,payload_hash
       ) values ($1,$2,$4,'job_probe',$3,$5,$6,'provider_probe',$7,$8,$9)`,
      [tenantId, projectId, billableAttemptId, attemptId, attemptIndex, state, externalId, submissionKey, sha("e")],
    );
  }

  async function replaceAttempt(previousAttemptId: string, replacementKey: string, previousKey: string, evidenceHash: string) {
    const client = await workerClient("comic_generation_worker");
    try {
      const result = await client.query(
        "select * from app.create_replacement_generation_attempt($1,$2,$3,$4,$5,$6)",
        [previousAttemptId, replacementKey, "provider_probe", previousKey, observedAt, evidenceHash],
      );
      return result.rows[0] as { attempt_id: string; billable_attempt_id: string };
    } finally {
      await client.query("reset session authorization");
      client.release();
    }
  }
});

function functionSql(sql: string, name: string): string {
  const start = sql.toLowerCase().indexOf(`create or replace function app.${name}`);
  if (start < 0) throw new Error(`TASK26_PROBE_FUNCTION_NOT_FOUND:${name}`);
  const end = sql.indexOf("$$;", start);
  if (end < 0) throw new Error(`TASK26_PROBE_FUNCTION_END_NOT_FOUND:${name}`);
  return sql.slice(start, end + 3);
}
