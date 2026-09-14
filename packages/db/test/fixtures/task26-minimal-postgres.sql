create extension if not exists pgcrypto with schema public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'comic_generation_worker') then
    create role comic_generation_worker nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'comic_media_worker') then
    create role comic_media_worker nologin;
  end if;
end;
$$;

create schema app;

create table app.generation_jobs (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  cancellation_state text not null default 'none',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, project_id, id)
);

create table app.billable_attempts (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  job_id text not null,
  status text not null default 'open',
  canceled_at timestamptz,
  primary key (tenant_id, project_id, id),
  unique (tenant_id, project_id, job_id, id)
);

create table app.usage_reservations (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  job_id text not null,
  attempt_id text not null,
  amount_micros numeric not null,
  settled_micros numeric not null default 0,
  released_micros numeric not null default 0,
  currency text not null,
  state text not null default 'reserved',
  primary key (tenant_id, project_id, id)
);

create table app.billing_currency_policies (
  tenant_id text not null,
  project_id text not null,
  currency text not null,
  primary key (tenant_id, project_id)
);

create table app.billing_budgets (
  tenant_id text not null,
  project_id text not null,
  currency text not null,
  reserved_micros numeric not null default 0,
  spent_micros numeric not null default 0,
  version bigint not null default 0,
  locked_at timestamptz,
  primary key (tenant_id, project_id)
);

create table app.outbox_events (
  tenant_id uuid not null,
  id uuid not null,
  route text not null,
  payload_hash text not null,
  state text not null,
  lease_until timestamptz,
  primary key (tenant_id, id)
);

create table app.generation_attempts (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  job_id text not null,
  billable_attempt_id text not null,
  attempt_index integer not null,
  state text not null,
  send_checkpoint text not null default 'definitely_not_sent',
  provider_config_id text not null,
  external_id text,
  submission_key text not null,
  reservation_id text,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, project_id, id),
  unique (id),
  unique (tenant_id, project_id, job_id, attempt_index),
  unique (submission_key)
);

create table app.generation_attempt_evidence (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  attempt_id text not null,
  kind text not null,
  previous_attempt_id text not null,
  provider_config_id text not null,
  submission_key text not null,
  observed_at timestamptz not null,
  evidence_hash text not null unique,
  created_at timestamptz not null default now(),
  primary key (tenant_id, project_id, id)
);

create table app.generation_absence_evidence_consumptions (
  tenant_id text not null,
  project_id text not null,
  evidence_hash text not null primary key,
  previous_attempt_id text not null,
  replacement_attempt_id text not null,
  consumed_at timestamptz not null default now(),
  unique (tenant_id, project_id, previous_attempt_id)
);

create table app.generation_work_bindings (
  tenant_id text not null,
  project_id text not null,
  generation_attempt_id text not null,
  outbox_tenant_id uuid not null,
  outbox_event_id uuid not null,
  route text not null,
  payload_hash text not null,
  primary key (tenant_id, project_id, generation_attempt_id),
  unique (generation_attempt_id),
  unique (outbox_event_id)
);

create table app.cancellation_operations (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  job_id text not null,
  attempt_id text not null,
  provider_config_id text not null,
  operation_key text not null unique,
  requested_by_user_id text not null,
  state text not null,
  provider_call_state text not null default 'not_invoked',
  terminal_status text,
  provider_cancellation_hash text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, project_id, id)
);

create table app.attempt_charges (
  tenant_id text not null,
  project_id text not null,
  attempt_id text not null,
  provider_charge_id text not null,
  ledger_movement_id text not null,
  amount_micros numeric not null,
  currency text not null,
  evidence_hash text not null,
  primary key (tenant_id, project_id, provider_charge_id)
);

create table app.ledger_movements (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  reservation_id text,
  attempt_id text,
  type text not null,
  direction text,
  account text not null,
  operation text not null,
  operation_id text not null,
  amount_micros numeric not null,
  currency text not null,
  evidence_hash text not null,
  adjustment_reason text,
  primary key (tenant_id, project_id, id)
);

create table app.provider_output_ingest_receipts (
  instruction_id text primary key,
  quarantine_key text not null unique,
  state text not null default 'pending',
  result_status text,
  result_bytes bigint,
  result_sha256 text,
  claimed_at timestamptz,
  lease_until timestamptz,
  claim_token text,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
