import { readFileSync } from "node:fs";

export function verifyIdentityMigration(sqlPath = "migrations/0001_identity.sql") {
  const sql = readFileSync(sqlPath, "utf8");
  const required = [
    "create table app.tenants",
    "create table app.projects",
    "create table app.beta_access_entries",
    "alter table app.tenants enable row level security",
    "alter table app.tenants force row level security",
    "bootstrap_http_tenant_scope",
    "bootstrap_http_project_scope",
    "revoke all on function app.bootstrap_http_tenant_scope",
    "comic_security_owner",
  ];
  const missing = required.filter((pattern) => !sql.toLowerCase().includes(pattern.toLowerCase()));
  if (missing.length > 0) throw new Error(`IDENTITY_MIGRATION_INCOMPLETE ${missing.join(",")}`);
  return { checked: required.length };
}

export function verifyIdempotencyAuditMigration(sqlPath = "migrations/0002_idempotency_audit.sql") {
  const sql = readFileSync(sqlPath, "utf8");
  const required = [
    "create table app.idempotency_keys",
    "create table app.audit_events",
    "create table app.outbox_events",
    "claim_token text",
    "create table app.consumer_receipts",
    "create table app.analytics_events",
    "create or replace function app.claim_outbox",
    "for update skip locked",
    "grant execute on function app.claim_outbox",
    "create or replace function app.requeue_outbox",
    "grant execute on function app.requeue_outbox",
  ];
  const missing = required.filter((pattern) => !sql.toLowerCase().includes(pattern.toLowerCase()));
  if (missing.length > 0) throw new Error(`IDEMPOTENCY_AUDIT_MIGRATION_INCOMPLETE ${missing.join(",")}`);
  return { checked: required.length };
}

export function verifyProjectsMigration(sqlPath = "migrations/0003_projects.sql") {
  const sql = readFileSync(sqlPath, "utf8");
  const required = [
    "alter table app.projects add column if not exists title",
    "create table app.project_heads",
    "create table app.episodes",
    "create table app.canvases",
    "create table app.canvas_session_revisions",
    "create table app.timeline_headers",
    "create table app.scripts",
    "create table app.script_sources",
    "create table app.script_revisions",
    "create table app.script_revision_scenes",
    "create table app.script_revision_beats",
    "create table app.script_revision_shots",
    "create table app.script_revision_lines",
    "create table app.episode_copy_previews",
    "create table app.episode_copy_policy_catalog",
    "create table app.episode_archive_blockers",
    "enable row level security",
    "force row level security",
    "unique (tenant_id, id)",
    "foreign key (tenant_id, project_id)",
    "check (copy_policy_version = 1)",
  ];
  const missing = required.filter((pattern) => !sql.toLowerCase().includes(pattern.toLowerCase()));
  if (missing.length > 0) throw new Error(`PROJECTS_MIGRATION_INCOMPLETE ${missing.join(",")}`);
  return { checked: required.length };
}

export function verifyRightsModerationMigration(sqlPath = "migrations/0004_rights_moderation.sql") {
  const sql = readFileSync(sqlPath, "utf8");
  const required = [
    "create table app.rights_records",
    "create table app.moderation_records",
    "create table app.ai_disclosure_policies",
    "create table app.approval_gate_policies",
    "create table app.governance_waivers",
    "create table app.provider_output_provenance",
    "create table app.remote_ingest_instructions",
    "check (waived_requirement in ('editorial_review','optional_brand_review'))",
    "check (label_text = '本内容包含AI生成元素')",
    "enable row level security",
    "force row level security",
    "unique (tenant_id, id)",
    "foreign key (tenant_id, project_id)",
  ];
  const missing = required.filter((pattern) => !sql.toLowerCase().includes(pattern.toLowerCase()));
  if (missing.length > 0) throw new Error(`RIGHTS_MODERATION_MIGRATION_INCOMPLETE ${missing.join(",")}`);
  return { checked: required.length };
}

export function verifyCanvasCollabMigration(sqlPath = "migrations/0005_canvas_collab.sql") {
  const sql = readFileSync(sqlPath, "utf8");
  const required = [
    "create table app.canvas_room_leases",
    "create table app.canvas_durable_revisions",
    "create table app.canvas_projection_counters",
    "create table app.canvas_projection_markers",
    "create table app.canvas_projection_receipts",
    "create table app.canvas_compaction_watermarks",
    "document_epoch",
    "projection_seq",
    "room_epoch",
    "unique (tenant_id, canvas_id, document_epoch, projection_seq)",
    "enable row level security",
    "force row level security",
    "foreign key (tenant_id, canvas_id)",
  ];
  const missing = required.filter((pattern) => !sql.toLowerCase().includes(pattern.toLowerCase()));
  if (missing.length > 0) throw new Error(`CANVAS_COLLAB_MIGRATION_INCOMPLETE ${missing.join(",")}`);
  return { checked: required.length };
}

export function verifyModelCatalogMigration(sqlPath = "migrations/0007_model_catalog.sql") {
  const sql = readFileSync(sqlPath, "utf8");
  const required = [
    "create table app.provider_configs",
    "create table app.model_catalog",
    "create table app.provider_route_audit",
    "create or replace function app.route_provider_webhook",
    "returns table(provider_config_id text, webhook_verification_secret_ref text)",
    "security definer",
    "set search_path = ''",
    "current_user <> 'comic_api'",
    "PROVIDER_WEBHOOK_ROUTE_NOT_FOUND",
    "alter function app.route_provider_webhook",
    "revoke all on table app.provider_configs from public",
    "revoke all on function app.route_provider_webhook",
    "grant execute on function app.route_provider_webhook",
    "comic_security_owner",
    "enable row level security",
    "force row level security",
  ];
  const missing = required.filter((pattern) => !sql.toLowerCase().includes(pattern.toLowerCase()));
  if (missing.length > 0) throw new Error(`MODEL_CATALOG_MIGRATION_INCOMPLETE ${missing.join(",")}`);
  const returns = sql
    .toLowerCase()
    .slice(sql.toLowerCase().indexOf("returns table"), sql.toLowerCase().indexOf("language plpgsql"));
  const leaked = ["tenant", "project", "attempt", "submit"].filter((pattern) => returns.includes(pattern));
  if (leaked.length > 0) throw new Error(`MODEL_CATALOG_ROUTE_SCOPE_LEAK ${leaked.join(",")}`);
  return { checked: required.length };
}

export function verifyBillingMigration(sqlPath = "migrations/0008_billing.sql") {
  const sql = readFileSync(sqlPath, "utf8");
  const required = [
    "create table app.billing_currency_policies",
    "create table app.billing_budgets",
    "create table app.usage_reservations",
    "create table app.billable_attempts",
    "create table app.ledger_movements",
    "create table app.attempt_charges",
    "numeric(38,0)",
    "overage_micros numeric(38,0) generated always as",
    "unique (tenant_id, project_id, operation_id)",
    "primary key (tenant_id, project_id, provider_charge_id)",
    "late_cancellation_bill",
    "insert into app.attempt_charges",
    "insert into app.ledger_movements",
    "BILLING_ATTEMPT_SCOPE_MISMATCH",
    "create or replace function app.reserve_usage",
    "create or replace function app.record_attempt_charge",
    "create or replace function app.release_usage_reservation",
    "create or replace function app.expire_usage_reservations",
    "BILLING_CURRENCY_MISMATCH",
    "BILLING_BUDGET_EXCEEDED",
    "security definer",
    "set search_path = ''",
    "enable row level security",
    "force row level security",
  ];
  const missing = required.filter((pattern) => !sql.toLowerCase().includes(pattern.toLowerCase()));
  if (missing.length > 0) throw new Error(`BILLING_MIGRATION_INCOMPLETE ${missing.join(",")}`);
  if (/\b(double precision|real|money)\b/i.test(sql)) throw new Error("BILLING_FLOAT_MONEY_TYPE");
  const chargeStart = sql.indexOf("create or replace function app.record_attempt_charge");
  const chargeEnd = sql.indexOf("$$;", chargeStart);
  const chargeFunction = sql.slice(chargeStart, chargeEnd);
  const requiredChargeScope = [
    "generationAttemptId text",
    "eventId uuid",
    "workPayloadHash text",
    "attempt.billable_attempt_id",
    "attempt.reservation_id",
    "binding.generation_attempt_id = attempt.id",
    "binding.outbox_event_id = eventId",
    "binding.payload_hash = workPayloadHash",
    "binding.route = 'generation.submit'",
    "event.route = binding.route",
    "event.payload_hash = binding.payload_hash",
    "event.tenant_id = binding.outbox_tenant_id",
    "event.state in ('claimed', 'published', 'terminal')",
    "reservation.attempt_id = attempt.billable_attempt_id",
    "billable.job_id = attempt.job_id",
    "for update of attempt, billable, reservation, binding, event",
    "session_user <> 'comic_generation_worker'",
    "reserved_micros = reserved_micros - amountMicros",
    "spent_micros = spent_micros + amountMicros",
    "cancellation_late_bill_adjustment",
    "late_cancellation_bill",
    "BILLING_PROVIDER_CHARGE_IMMUTABLE",
  ];
  const missingChargeScope = requiredChargeScope.filter((pattern) => !chargeFunction.includes(pattern));
  if (missingChargeScope.length > 0) throw new Error(`BILLING_CHARGE_SCOPE_INCOMPLETE ${missingChargeScope.join(",")}`);
  const chargeSignature = chargeFunction.slice(0, chargeFunction.indexOf(") returns text"));
  if (/\b(tenantId|projectId|attemptId|reservationId)\s+text\b/.test(chargeSignature))
    throw new Error("BILLING_CHARGE_CALLER_SCOPE_LEAK");
  if (chargeFunction.includes("current_user")) throw new Error("BILLING_CHARGE_CALLER_GUARD_INVALID");
  if (chargeFunction.includes("app.selections")) throw new Error("BILLING_CHARGE_SELECTION_MUTATION");
  if (
    chargeFunction.includes("claimToken") ||
    chargeFunction.includes("claim_token_hash") ||
    chargeFunction.includes("lease_until") ||
    chargeFunction.includes("event.state = 'claimed'") ||
    chargeFunction.includes("'pending'")
  )
    throw new Error("BILLING_CHARGE_SHORT_LEASE_DEPENDENCY");
  if (
    sql.includes("record_attempt_charge(text, text, numeric, text, text, boolean)") ||
    sql.includes("record_attempt_charge(text, uuid, text, text, text, numeric, text, text, boolean)")
  )
    throw new Error("BILLING_CHARGE_OLD_SIGNATURE");
  const releaseStart = sql.indexOf("create or replace function app.release_usage_reservation");
  const releaseEnd = sql.indexOf("$$;", releaseStart);
  const releaseFunction = sql.slice(releaseStart, releaseEnd);
  const requiredReleaseSemantics = [
    "session_user <> 'comic_api'",
    "remaining_micros",
    "released_micros = released_micros + remaining_micros",
    "state = 'released'",
    "reserved_micros = reserved_micros - remaining_micros",
    "reservation_hold",
    "tenant_budget",
    "status = 'canceled'",
    "canceled_at = coalesce(canceled_at, now())",
  ];
  const missingReleaseSemantics = requiredReleaseSemantics.filter((pattern) => !releaseFunction.includes(pattern));
  if (missingReleaseSemantics.length > 0)
    throw new Error(`BILLING_RELEASE_INCOMPLETE ${missingReleaseSemantics.join(",")}`);
  if (/as \$\$\s*begin\s*return reservationId;\s*end;/i.test(releaseFunction))
    throw new Error("BILLING_RELEASE_PLACEHOLDER");
  const chargeGrant =
    "grant execute on function app.record_attempt_charge(text, uuid, text, text, numeric, text, text, boolean) to comic_generation_worker";
  if (!sql.toLowerCase().includes(chargeGrant)) throw new Error("BILLING_CHARGE_GRANT_INVALID");
  return { checked: required.length + requiredChargeScope.length + requiredReleaseSemantics.length + 7 };
}

export function verifyGenerationMigration(sqlPath = "migrations/0009_generation.sql") {
  const sql = readFileSync(sqlPath, "utf8");
  const required = [
    "create table app.generation_jobs",
    "create table app.generation_attempts",
    "send_checkpoint text not null",
    "definitely_not_sent",
    "possibly_sent",
    "bytes_started",
    "create table app.generation_attempt_evidence",
    "create trigger generation_attempt_evidence_immutable",
    "create table app.generation_absence_evidence_consumptions",
    "unique (id)",
    "create table app.generation_work_bindings",
    "route text not null check (route = 'generation.submit')",
    "unique (generation_attempt_id)",
    "unique (outbox_event_id)",
    "outbox_tenant_id uuid not null",
    "check (outbox_tenant_id = tenant_id::uuid)",
    "foreign key (outbox_tenant_id, outbox_event_id) references app.outbox_events(tenant_id, id)",
    "create trigger generation_work_bindings_immutable",
    "before update or delete on app.generation_work_bindings",
    "create or replace function app.create_generation_attempt_work",
    "insert into app.billable_attempts",
    "perform app.reserve_usage",
    "insert into app.outbox_events",
    "insert into app.generation_attempts",
    "insert into app.generation_work_bindings",
    "grant execute on function app.create_generation_attempt_work",
    "create table app.cancellation_operations",
    "attempt_id text not null",
    "provider_call_state text not null",
    "possibly_invoked",
    "create or replace function app.get_generation_attempt",
    "create or replace function app.get_generation_attempt_by_submission_key",
    "create or replace function app.transition_generation_attempt",
    "create or replace function app.begin_generation_cancellation",
    "create or replace function app.complete_generation_cancellation",
    "create or replace function app.create_replacement_generation_attempt",
    "late_terminal_conflict",
    "GENERATION_ABSENCE_EVIDENCE_ALREADY_CONSUMED",
    "create table app.provider_webhook_receipts",
    "create table app.provider_events",
    "create table app.selections",
    "create table app.selection_heads",
    "foreign key (tenant_id, project_id, billable_attempt_id) references app.billable_attempts",
    "foreign key (tenant_id, project_id, job_id, billable_attempt_id) references app.billable_attempts",
    "unique (submission_key)",
    "generation_attempts_provider_external_once",
    "where external_id is not null",
    "unique (tenant_id, project_id, operation_key)",
    "verifier_stage text not null check (verifier_stage = 'post_signature')",
    "create or replace function app.record_verified_provider_receipt",
    "create or replace function app.bootstrap_verified_provider_event",
    "returns table(tenant_id text, project_id text, attempt_id text)",
    "security definer",
    "set search_path = ''",
    "session_user <> 'comic_api'",
    "receipt.consumed_at is null",
    "attempt.provider_config_id = receipt.provider_config_id",
    "attempt.external_id = receipt.external_id",
    "attempt.tenant_id = receipt.tenant_id",
    "attempt.project_id = receipt.project_id",
    "insert into app.provider_events",
    "unique (provider_config_id, external_event_id)",
    "grant execute on function app.bootstrap_verified_provider_event",
    "comment on function app.bootstrap_verified_provider_event(text, text, text, text, text, text)",
    "enable row level security",
    "force row level security",
  ];
  const missing = required.filter((pattern) => !sql.toLowerCase().includes(pattern.toLowerCase()));
  if (missing.length > 0) throw new Error(`GENERATION_MIGRATION_INCOMPLETE ${missing.join(",")}`);
  if (sql.includes("outbox_claim_token_hash") || sql.includes("claim_token_hash"))
    throw new Error("GENERATION_WORK_BINDING_ROTATING_TOKEN_DEPENDENCY");
  const bootstrapReturn = sql
    .toLowerCase()
    .slice(sql.toLowerCase().indexOf("returns table"), sql.toLowerCase().indexOf("language plpgsql"));
  const leaked = ["provider_config", "external", "receipt", "payload"].filter((pattern) =>
    bootstrapReturn.includes(pattern),
  );
  if (leaked.length > 0) throw new Error(`GENERATION_PROVIDER_SCOPE_LEAK ${leaked.join(",")}`);
  return { checked: required.length };
}
