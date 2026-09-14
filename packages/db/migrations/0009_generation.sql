-- Task 25: durable generation jobs, attempts, cancellation, selections and post-signature provider bootstrap.

create table app.generation_jobs (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  episode_id text not null,
  canvas_id text not null,
  active_canvas_revision_id text not null,
  document_epoch bigint not null,
  durable_seq bigint not null,
  state text not null check (state in ('pending','queued','dispatching','running','reconciling','succeeded','failed','canceled')),
  cancellation_state text not null default 'none' check (cancellation_state in ('none','requested','acknowledged','unsupported','unknown')),
  submission_key text not null,
  model_catalog_id text not null references app.model_catalog(id),
  provider_config_id text not null references app.provider_configs(id),
  input_hash text not null check (input_hash like 'sha256:%'),
  config_hash text not null check (config_hash like 'sha256:%'),
  provider_request_hash text not null check (provider_request_hash like 'sha256:%'),
  estimate_amount_micros numeric(38,0) not null check (estimate_amount_micros >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$' and currency <> 'XXX'),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, project_id, id),
  unique (submission_key),
  unique (tenant_id, project_id, id),
  foreign key (tenant_id, project_id) references app.projects(tenant_id, id),
  foreign key (tenant_id, episode_id) references app.episodes(tenant_id, id),
  foreign key (tenant_id, canvas_id) references app.canvases(tenant_id, id),
  foreign key (tenant_id, project_id) references app.billing_budgets(tenant_id, project_id)
);

alter table app.generation_jobs enable row level security;
alter table app.generation_jobs force row level security;

create table app.generation_attempts (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  job_id text not null,
  billable_attempt_id text not null,
  attempt_index integer not null check (attempt_index > 0),
  state text not null check (state in ('created','submitted','accepted','running','reconciling','succeeded','failed','canceled','unknown')),
  send_checkpoint text not null default 'definitely_not_sent'
    check (send_checkpoint in ('definitely_not_sent','possibly_sent','bytes_started')),
  provider_config_id text not null references app.provider_configs(id),
  external_id text,
  submission_key text not null,
  reservation_id text,
  payload_hash text not null check (payload_hash like 'sha256:%'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, project_id, id),
  unique (id),
  unique (tenant_id, project_id, job_id, id),
  unique (tenant_id, project_id, job_id, attempt_index),
  unique (submission_key),
  foreign key (tenant_id, project_id, job_id) references app.generation_jobs(tenant_id, project_id, id),
  foreign key (tenant_id, project_id, billable_attempt_id) references app.billable_attempts(tenant_id, project_id, id),
  foreign key (tenant_id, project_id, job_id, billable_attempt_id) references app.billable_attempts(tenant_id, project_id, job_id, id),
  foreign key (tenant_id, project_id, reservation_id) references app.usage_reservations(tenant_id, project_id, id)
);

alter table app.generation_attempts enable row level security;
alter table app.generation_attempts force row level security;

create unique index generation_attempts_provider_external_once
  on app.generation_attempts(provider_config_id, external_id)
  where external_id is not null;

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
  evidence_hash text not null check (evidence_hash ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (tenant_id, project_id, id),
  unique (evidence_hash),
  foreign key (tenant_id, project_id, attempt_id)
    references app.generation_attempts(tenant_id, project_id, id),
  foreign key (tenant_id, project_id, previous_attempt_id)
    references app.generation_attempts(tenant_id, project_id, id)
);

alter table app.generation_attempt_evidence enable row level security;
alter table app.generation_attempt_evidence force row level security;

create or replace function app.reject_generation_attempt_evidence_mutation() returns trigger
language plpgsql
as $$
begin
  raise exception 'GENERATION_ATTEMPT_EVIDENCE_IMMUTABLE';
end;
$$;

create trigger generation_attempt_evidence_immutable
before update or delete on app.generation_attempt_evidence
for each row execute function app.reject_generation_attempt_evidence_mutation();

create table app.generation_absence_evidence_consumptions (
  tenant_id text not null,
  project_id text not null,
  evidence_hash text not null,
  previous_attempt_id text not null,
  replacement_attempt_id text not null,
  consumed_at timestamptz not null default now(),
  primary key (evidence_hash),
  unique (tenant_id, project_id, previous_attempt_id),
  foreign key (tenant_id, project_id, previous_attempt_id)
    references app.generation_attempts(tenant_id, project_id, id),
  foreign key (tenant_id, project_id, replacement_attempt_id)
    references app.generation_attempts(tenant_id, project_id, id)
);

alter table app.generation_absence_evidence_consumptions enable row level security;
alter table app.generation_absence_evidence_consumptions force row level security;

create trigger generation_absence_evidence_consumptions_immutable
before update or delete on app.generation_absence_evidence_consumptions
for each row execute function app.reject_generation_attempt_evidence_mutation();

create table app.generation_work_bindings (
  tenant_id text not null,
  project_id text not null,
  generation_attempt_id text not null,
  outbox_tenant_id uuid not null,
  outbox_event_id uuid not null,
  route text not null check (route = 'generation.submit'),
  payload_hash text not null check (payload_hash ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (tenant_id, project_id, generation_attempt_id),
  unique (generation_attempt_id),
  unique (outbox_event_id),
  check (outbox_tenant_id = tenant_id::uuid),
  foreign key (tenant_id, project_id, generation_attempt_id)
    references app.generation_attempts(tenant_id, project_id, id),
  foreign key (outbox_tenant_id, outbox_event_id) references app.outbox_events(tenant_id, id)
);

alter table app.generation_work_bindings enable row level security;
alter table app.generation_work_bindings force row level security;

create or replace function app.reject_generation_work_binding_mutation() returns trigger
language plpgsql
as $$
begin
  raise exception 'GENERATION_WORK_BINDING_IMMUTABLE';
end;
$$;

create trigger generation_work_bindings_immutable
before update or delete on app.generation_work_bindings
for each row execute function app.reject_generation_work_binding_mutation();

create or replace function app.create_generation_attempt_work(
  tenantId text,
  projectId text,
  generationAttemptId text,
  jobId text,
  billableAttemptId text,
  attemptIndex integer,
  providerConfigId text,
  submissionKey text,
  reservationId text,
  reservationOperationId text,
  amountMicros numeric,
  chargeCurrency text,
  reservationExpiresAt timestamptz,
  outboxEventId uuid,
  outboxPayloadHash text,
  attemptPayloadHash text
) returns table(event_id uuid, route text, payload_hash text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user <> 'comic_api' then raise exception 'GENERATION_ATTEMPT_CREATE_CALLER_FORBIDDEN'; end if;
  if outboxPayloadHash !~ '^sha256:[a-f0-9]{64}$' or attemptPayloadHash !~ '^sha256:[a-f0-9]{64}$' then
    raise exception 'GENERATION_ATTEMPT_PAYLOAD_HASH_INVALID';
  end if;

  insert into app.billable_attempts(tenant_id, project_id, id, job_id)
  values (tenantId, projectId, billableAttemptId, jobId);

  perform app.reserve_usage(
    tenantId, projectId, reservationId, jobId, billableAttemptId, reservationOperationId,
    amountMicros, chargeCurrency, reservationExpiresAt
  );

  insert into app.outbox_events(tenant_id, id, route, payload_hash, state)
  values (tenantId::uuid, outboxEventId, 'generation.submit', outboxPayloadHash, 'pending');

  insert into app.generation_attempts(
    tenant_id, project_id, id, job_id, billable_attempt_id, attempt_index, state,
    provider_config_id, submission_key, reservation_id, payload_hash
  ) values (
    tenantId, projectId, generationAttemptId, jobId, billableAttemptId, attemptIndex, 'created',
    providerConfigId, submissionKey, reservationId, attemptPayloadHash
  );

  insert into app.generation_work_bindings(
    tenant_id, project_id, generation_attempt_id, outbox_tenant_id, outbox_event_id, route, payload_hash
  ) values (
    tenantId, projectId, generationAttemptId, tenantId::uuid, outboxEventId, 'generation.submit', outboxPayloadHash
  );

  return query select outboxEventId, 'generation.submit'::text, outboxPayloadHash;
end;
$$;

create table app.cancellation_operations (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  job_id text not null,
  attempt_id text not null,
  provider_config_id text not null,
  operation_key text not null,
  requested_by_user_id text not null,
  state text not null check (state in ('requested','acknowledged','unsupported','unknown')),
  provider_call_state text not null default 'not_invoked'
    check (provider_call_state in ('not_invoked','possibly_invoked','completed')),
  terminal_status text check (terminal_status in ('succeeded','failed','canceled')),
  provider_cancellation_hash text check (provider_cancellation_hash like 'sha256:%'),
  created_at timestamptz not null default now(),
  primary key (tenant_id, project_id, id),
  unique (tenant_id, project_id, operation_key),
  unique (tenant_id, project_id, job_id, operation_key),
  unique (operation_key),
  foreign key (tenant_id, project_id, job_id) references app.generation_jobs(tenant_id, project_id, id),
  foreign key (tenant_id, project_id, attempt_id) references app.generation_attempts(tenant_id, project_id, id),
  foreign key (tenant_id, project_id, job_id, attempt_id)
    references app.generation_attempts(tenant_id, project_id, job_id, id)
);

alter table app.cancellation_operations enable row level security;
alter table app.cancellation_operations force row level security;

create or replace function app.get_generation_attempt(attemptId text)
returns table(
  attempt_id text, billable_attempt_id text, tenant_id text, project_id text, job_id text,
  provider_config_id text, submission_key text, state text, external_id text,
  cancellation_state text, send_checkpoint text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user <> 'comic_generation_worker' then raise exception 'GENERATION_ATTEMPT_CALLER_FORBIDDEN'; end if;
  return query
  select attempt.id, attempt.billable_attempt_id, attempt.tenant_id, attempt.project_id, attempt.job_id,
    attempt.provider_config_id, attempt.submission_key, attempt.state, attempt.external_id,
    job.cancellation_state, attempt.send_checkpoint
  from app.generation_attempts attempt
  join app.generation_jobs job
    on job.tenant_id = attempt.tenant_id and job.project_id = attempt.project_id and job.id = attempt.job_id
  where attempt.id = attemptId;
end;
$$;

create or replace function app.get_generation_attempt_by_submission_key(submissionKey text)
returns table(
  attempt_id text, billable_attempt_id text, tenant_id text, project_id text, job_id text,
  provider_config_id text, submission_key text, state text, external_id text,
  cancellation_state text, send_checkpoint text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user <> 'comic_generation_worker' then raise exception 'GENERATION_ATTEMPT_CALLER_FORBIDDEN'; end if;
  return query
  select attempt.id, attempt.billable_attempt_id, attempt.tenant_id, attempt.project_id, attempt.job_id,
    attempt.provider_config_id, attempt.submission_key, attempt.state, attempt.external_id,
    job.cancellation_state, attempt.send_checkpoint
  from app.generation_attempts attempt
  join app.generation_jobs job
    on job.tenant_id = attempt.tenant_id and job.project_id = attempt.project_id and job.id = attempt.job_id
  where attempt.submission_key = submissionKey;
end;
$$;

create or replace function app.transition_generation_attempt(
  attemptId text,
  expectedState text,
  nextState text,
  nextExternalId text,
  nextCancellationState text,
  nextSendCheckpoint text,
  evidenceKind text,
  evidenceObservedAt timestamptz,
  evidenceHash text
) returns table(
  attempt_id text, billable_attempt_id text, tenant_id text, project_id text, job_id text,
  provider_config_id text, submission_key text, state text, external_id text,
  cancellation_state text, send_checkpoint text
)
language plpgsql
security definer
set search_path = ''
as $$
declare attempt app.generation_attempts%rowtype;
declare job app.generation_jobs%rowtype;
begin
  if session_user <> 'comic_generation_worker' then raise exception 'GENERATION_ATTEMPT_CALLER_FORBIDDEN'; end if;
  if evidenceHash !~ '^sha256:[a-f0-9]{64}$' or evidenceObservedAt is null then
    raise exception 'GENERATION_ATTEMPT_EVIDENCE_INVALID';
  end if;
  select * into attempt from app.generation_attempts where id = attemptId for update;
  if not found then raise exception 'GENERATION_ATTEMPT_NOT_FOUND'; end if;
  select * into job from app.generation_jobs
  where tenant_id = attempt.tenant_id and project_id = attempt.project_id and id = attempt.job_id for update;
  if attempt.state <> expectedState then raise exception 'GENERATION_ATTEMPT_CAS_MISMATCH'; end if;
  if attempt.state in ('succeeded','failed','canceled') then
    insert into app.generation_attempt_evidence(
      tenant_id, project_id, id, attempt_id, kind, previous_attempt_id,
      provider_config_id, submission_key, observed_at, evidence_hash
    ) values (
      attempt.tenant_id, attempt.project_id, 'evidence_' || substr(replace(evidenceHash, 'sha256:', ''), 1, 24),
      attempt.id,
      evidenceKind || case when nextState <> attempt.state then '_late_terminal_conflict' else '' end,
      attempt.id, attempt.provider_config_id, attempt.submission_key, evidenceObservedAt, evidenceHash
    ) on conflict (evidence_hash) do nothing;
    return query select * from app.get_generation_attempt(attempt.id);
    return;
  end if;
  if not (
    (attempt.state = 'created' and nextState in ('submitted','reconciling','failed','canceled')) or
    (attempt.state = 'submitted' and nextState in ('submitted','accepted','reconciling','failed','canceled')) or
    (attempt.state = 'accepted' and nextState in ('running','reconciling','succeeded','failed','canceled')) or
    (attempt.state = 'running' and nextState in ('running','reconciling','succeeded','failed','canceled')) or
    (attempt.state = 'reconciling' and nextState in ('submitted','accepted','running','reconciling','succeeded','failed','canceled'))
  ) then raise exception 'GENERATION_ATTEMPT_TRANSITION_INVALID'; end if;
  if nextExternalId is not null and attempt.external_id is not null and attempt.external_id <> nextExternalId then
    raise exception 'GENERATION_ATTEMPT_EXTERNAL_ID_IMMUTABLE';
  end if;
  if nextSendCheckpoint is not null and not (
    (attempt.send_checkpoint = 'definitely_not_sent' and nextSendCheckpoint in ('definitely_not_sent','possibly_sent','bytes_started')) or
    (attempt.send_checkpoint = 'possibly_sent' and nextSendCheckpoint in ('possibly_sent','bytes_started')) or
    (attempt.send_checkpoint = 'bytes_started' and nextSendCheckpoint = 'bytes_started')
  ) then raise exception 'GENERATION_ATTEMPT_SEND_CHECKPOINT_REGRESSION'; end if;

  update app.generation_attempts
  set state = nextState, external_id = coalesce(nextExternalId, external_id),
    send_checkpoint = coalesce(nextSendCheckpoint, send_checkpoint), updated_at = now()
  where id = attempt.id and state = expectedState;
  if not found then raise exception 'GENERATION_ATTEMPT_CAS_MISMATCH'; end if;
  if nextCancellationState is not null then
    update app.generation_jobs set cancellation_state = nextCancellationState, updated_at = now()
    where tenant_id = attempt.tenant_id and project_id = attempt.project_id and id = attempt.job_id;
  end if;
  insert into app.generation_attempt_evidence(
    tenant_id, project_id, id, attempt_id, kind, previous_attempt_id,
    provider_config_id, submission_key, observed_at, evidence_hash
  ) values (
    attempt.tenant_id, attempt.project_id, 'evidence_' || substr(replace(evidenceHash, 'sha256:', ''), 1, 24),
    attempt.id, evidenceKind, attempt.id, attempt.provider_config_id, attempt.submission_key,
    evidenceObservedAt, evidenceHash
  );
  return query select * from app.get_generation_attempt(attempt.id);
end;
$$;

create or replace function app.begin_generation_cancellation(operationKey text, attemptId text)
returns table(disposition text, cancellation_state text, terminal_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare attempt app.generation_attempts%rowtype;
declare operation app.cancellation_operations%rowtype;
declare crashEvidenceHash text;
begin
  if session_user <> 'comic_generation_worker' then raise exception 'GENERATION_CANCELLATION_CALLER_FORBIDDEN'; end if;
  select * into operation from app.cancellation_operations where operation_key = operationKey for update;
  if found and operation.attempt_id <> attemptId then raise exception 'CANCELLATION_OPERATION_SCOPE_MISMATCH'; end if;
  select * into attempt from app.generation_attempts where id = attemptId for update;
  if not found then raise exception 'GENERATION_ATTEMPT_NOT_FOUND'; end if;
  if operation.id is not null then
    if operation.attempt_id <> attempt.id or operation.tenant_id <> attempt.tenant_id
      or operation.project_id <> attempt.project_id or operation.provider_config_id <> attempt.provider_config_id then
      raise exception 'CANCELLATION_OPERATION_SCOPE_MISMATCH';
    end if;
    if operation.provider_call_state = 'completed' then
      return query select 'existing'::text, operation.state, operation.terminal_status;
      return;
    end if;
    if operation.provider_call_state = 'possibly_invoked' then
      crashEvidenceHash := 'sha256:' || pg_catalog.encode(
        public.digest(operationKey || ':provider-call-ambiguous', 'sha256'), 'hex'
      );
      insert into app.generation_attempt_evidence(
        tenant_id, project_id, id, attempt_id, kind, previous_attempt_id,
        provider_config_id, submission_key, observed_at, evidence_hash
      ) values (
        attempt.tenant_id, attempt.project_id, 'evidence_' || substr(replace(crashEvidenceHash, 'sha256:', ''), 1, 24),
        attempt.id, 'cancellation_unknown_after_invoke_start', attempt.id, attempt.provider_config_id,
        attempt.submission_key, now(), crashEvidenceHash
      ) on conflict (evidence_hash) do nothing;
      return query select 'existing'::text, 'unknown'::text, null::text;
      return;
    end if;
  else
    insert into app.cancellation_operations(
      tenant_id, project_id, id, job_id, attempt_id, provider_config_id,
      operation_key, requested_by_user_id, state, provider_call_state
    ) values (
      attempt.tenant_id, attempt.project_id, 'cancel_' || substr(md5(operationKey), 1, 24), attempt.job_id,
      attempt.id, attempt.provider_config_id, operationKey, 'system:generation-worker', 'requested', 'not_invoked'
    );
  end if;
  update app.generation_jobs generation_job
  set cancellation_state = 'requested', updated_at = now()
  where generation_job.tenant_id = attempt.tenant_id
    and generation_job.project_id = attempt.project_id
    and generation_job.id = attempt.job_id
    and generation_job.cancellation_state = 'none';
  return query select 'invoke'::text, 'requested'::text, null::text;
end;
$$;

create or replace function app.mark_generation_cancellation_invoke_started(operationKey text, attemptId text)
returns table(disposition text, cancellation_state text, terminal_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare attempt app.generation_attempts%rowtype;
declare operation app.cancellation_operations%rowtype;
begin
  if session_user <> 'comic_generation_worker' then raise exception 'GENERATION_CANCELLATION_CALLER_FORBIDDEN'; end if;
  select cancellation_operation.* into operation
  from app.cancellation_operations cancellation_operation
  where cancellation_operation.operation_key = operationKey
  for update of cancellation_operation;
  if not found or operation.attempt_id <> attemptId then raise exception 'CANCELLATION_OPERATION_SCOPE_MISMATCH'; end if;
  select generation_attempt.* into attempt
  from app.generation_attempts generation_attempt
  where generation_attempt.id = attemptId
  for update of generation_attempt;
  if not found or operation.tenant_id <> attempt.tenant_id or operation.project_id <> attempt.project_id
    or operation.provider_config_id <> attempt.provider_config_id then
    raise exception 'CANCELLATION_OPERATION_SCOPE_MISMATCH';
  end if;
  if operation.provider_call_state = 'completed' then
    return query select 'existing'::text, operation.state, operation.terminal_status;
    return;
  end if;
  if operation.provider_call_state = 'possibly_invoked' then
    return query select 'existing'::text, 'unknown'::text, null::text;
    return;
  end if;
  update app.cancellation_operations cancellation_operation
  set provider_call_state = 'possibly_invoked'
  where cancellation_operation.tenant_id = operation.tenant_id
    and cancellation_operation.project_id = operation.project_id
    and cancellation_operation.id = operation.id
    and cancellation_operation.provider_call_state = 'not_invoked';
  if not found then raise exception 'CANCELLATION_OPERATION_CAS_MISMATCH'; end if;
  return query select 'invoke'::text, 'requested'::text, null::text;
end;
$$;

create or replace function app.complete_generation_cancellation(
  operationKey text,
  attemptId text,
  nextCancellationState text,
  terminalStatus text,
  evidenceHash text
) returns table(disposition text, cancellation_state text, terminal_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare attempt app.generation_attempts%rowtype;
declare operation app.cancellation_operations%rowtype;
declare terminalConflict boolean;
declare cancellationEvidenceKind text;
begin
  if session_user <> 'comic_generation_worker' then raise exception 'GENERATION_CANCELLATION_CALLER_FORBIDDEN'; end if;
  if nextCancellationState not in ('acknowledged','unsupported','unknown') or evidenceHash !~ '^sha256:[a-f0-9]{64}$' then
    raise exception 'GENERATION_CANCELLATION_RESULT_INVALID';
  end if;
  select * into operation from app.cancellation_operations where operation_key = operationKey for update;
  if not found then raise exception 'CANCELLATION_OPERATION_SCOPE_MISMATCH'; end if;
  if operation.attempt_id <> attemptId then raise exception 'CANCELLATION_OPERATION_SCOPE_MISMATCH'; end if;
  select * into attempt from app.generation_attempts where id = attemptId for update;
  if not found then raise exception 'GENERATION_ATTEMPT_NOT_FOUND'; end if;
  if operation.attempt_id <> attempt.id or operation.tenant_id <> attempt.tenant_id
    or operation.project_id <> attempt.project_id or operation.provider_config_id <> attempt.provider_config_id then
    raise exception 'CANCELLATION_OPERATION_SCOPE_MISMATCH';
  end if;
  if operation.provider_call_state = 'completed' then
    return query select 'completed'::text, operation.state, operation.terminal_status;
    return;
  end if;
  if operation.provider_call_state <> 'possibly_invoked' then
    raise exception 'CANCELLATION_PROVIDER_INVOKE_NOT_STARTED';
  end if;
  if terminalStatus is not null and terminalStatus not in ('succeeded','failed','canceled') then
    raise exception 'CANCEL_ALREADY_TERMINAL_STATUS_INVALID';
  end if;
  terminalConflict := terminalStatus is not null and attempt.state in ('succeeded','failed','canceled')
    and attempt.state <> terminalStatus;
  if terminalStatus is not null and attempt.state not in ('succeeded','failed','canceled') then
    update app.generation_attempts set state = terminalStatus, updated_at = now() where id = attempt.id and state = attempt.state;
  end if;
  update app.generation_jobs set cancellation_state = nextCancellationState, updated_at = now()
  where tenant_id = attempt.tenant_id and project_id = attempt.project_id and id = attempt.job_id;
  update app.cancellation_operations
  set state = nextCancellationState, provider_call_state = 'completed', terminal_status = terminalStatus,
    provider_cancellation_hash = evidenceHash
  where operation_key = operationKey and attempt_id = attempt.id and provider_call_state = 'possibly_invoked';
  if not found then raise exception 'CANCELLATION_OPERATION_CAS_MISMATCH'; end if;
  cancellationEvidenceKind := 'cancellation_' || nextCancellationState
    || case when terminalConflict then '_late_terminal_conflict' else '' end;
  insert into app.generation_attempt_evidence(
    tenant_id, project_id, id, attempt_id, kind, previous_attempt_id,
    provider_config_id, submission_key, observed_at, evidence_hash
  ) values (
    attempt.tenant_id, attempt.project_id, 'evidence_' || substr(replace(evidenceHash, 'sha256:', ''), 1, 24),
    attempt.id, cancellationEvidenceKind, attempt.id, attempt.provider_config_id,
    attempt.submission_key, now(), evidenceHash
  ) on conflict (evidence_hash) do nothing;
  return query select 'completed'::text, nextCancellationState, terminalStatus;
end;
$$;

create or replace function app.create_replacement_generation_attempt(
  previousAttemptId text,
  replacementSubmissionKey text,
  evidenceProviderConfigId text,
  evidenceSubmissionKey text,
  evidenceObservedAt timestamptz,
  evidenceHash text
) returns table(
  attempt_id text, billable_attempt_id text, tenant_id text, project_id text, job_id text,
  provider_config_id text, submission_key text, state text, external_id text,
  cancellation_state text, send_checkpoint text
)
language plpgsql
security definer
set search_path = ''
as $$
declare previousAttempt app.generation_attempts%rowtype;
declare absenceEvidence app.generation_attempt_evidence%rowtype;
declare previousReservation app.usage_reservations%rowtype;
declare lockedJob app.generation_jobs%rowtype;
declare replacementAttemptId text;
declare replacementBillableAttemptId text;
declare replacementIndex integer;
declare replacementOutboxEventId uuid;
declare replacementOutboxPayloadHash text;
begin
  if session_user <> 'comic_generation_worker' then raise exception 'GENERATION_ATTEMPT_CALLER_FORBIDDEN'; end if;
  select * into previousAttempt from app.generation_attempts where id = previousAttemptId for update;
  if not found then raise exception 'GENERATION_ATTEMPT_NOT_FOUND'; end if;
  select stored_evidence.* into absenceEvidence
  from app.generation_attempt_evidence stored_evidence
  where stored_evidence.previous_attempt_id = previousAttempt.id
    and stored_evidence.provider_config_id = evidenceProviderConfigId
    and stored_evidence.submission_key = evidenceSubmissionKey
    and stored_evidence.observed_at = evidenceObservedAt
    and stored_evidence.evidence_hash = evidenceHash
    and stored_evidence.kind = 'recovery_definitively_absent'
  for update of stored_evidence;
  if not found or evidenceProviderConfigId <> previousAttempt.provider_config_id
    or evidenceSubmissionKey <> previousAttempt.submission_key then
    raise exception 'GENERATION_ABSENCE_EVIDENCE_SCOPE_MISMATCH';
  end if;
  if exists (select 1 from app.generation_absence_evidence_consumptions where evidence_hash = evidenceHash) then
    raise exception 'GENERATION_ABSENCE_EVIDENCE_ALREADY_CONSUMED';
  end if;
  select replacement_job.* into lockedJob
  from app.generation_jobs replacement_job
  where replacement_job.tenant_id = previousAttempt.tenant_id
    and replacement_job.project_id = previousAttempt.project_id
    and replacement_job.id = previousAttempt.job_id
  for update of replacement_job;
  if not found then raise exception 'GENERATION_JOB_NOT_FOUND'; end if;
  replacementAttemptId := 'attempt_' || substr(md5(replacementSubmissionKey || ':generation'), 1, 24);
  replacementBillableAttemptId := 'attempt_' || substr(md5(replacementSubmissionKey || ':billable'), 1, 24);
  replacementOutboxEventId := (
    substr(md5(replacementSubmissionKey || ':outbox'), 1, 8) || '-' ||
    substr(md5(replacementSubmissionKey || ':outbox'), 9, 4) || '-' ||
    substr(md5(replacementSubmissionKey || ':outbox'), 13, 4) || '-' ||
    substr(md5(replacementSubmissionKey || ':outbox'), 17, 4) || '-' ||
    substr(md5(replacementSubmissionKey || ':outbox'), 21, 12)
  )::uuid;
  replacementOutboxPayloadHash := 'sha256:' || pg_catalog.encode(
    public.digest(replacementOutboxEventId::text || ':generation.submit:' || replacementAttemptId, 'sha256'), 'hex'
  );
  select coalesce(max(candidate_attempt.attempt_index), 0) + 1 into replacementIndex
  from app.generation_attempts candidate_attempt
  where candidate_attempt.tenant_id = previousAttempt.tenant_id
    and candidate_attempt.project_id = previousAttempt.project_id
    and candidate_attempt.job_id = previousAttempt.job_id;
  insert into app.billable_attempts(tenant_id, project_id, id, job_id)
  values (previousAttempt.tenant_id, previousAttempt.project_id, replacementBillableAttemptId, previousAttempt.job_id);
  if previousAttempt.reservation_id is not null then
    select reservation.* into previousReservation
    from app.usage_reservations reservation
    where reservation.tenant_id = previousAttempt.tenant_id
      and reservation.project_id = previousAttempt.project_id
      and reservation.id = previousAttempt.reservation_id
    for update of reservation;
    if not found or previousReservation.attempt_id <> previousAttempt.billable_attempt_id
      or previousReservation.settled_micros <> 0 or previousReservation.released_micros <> 0
      or exists (
        select 1 from app.attempt_charges charge
        where charge.tenant_id = previousAttempt.tenant_id and charge.project_id = previousAttempt.project_id
          and charge.attempt_id = previousAttempt.billable_attempt_id
      ) then raise exception 'GENERATION_ABSENCE_EVIDENCE_BILLING_CONFLICT'; end if;
    update app.usage_reservations reservation
    set attempt_id = replacementBillableAttemptId
    where reservation.tenant_id = previousAttempt.tenant_id
      and reservation.project_id = previousAttempt.project_id
      and reservation.id = previousAttempt.reservation_id;
    update app.billable_attempts billable_attempt
    set status = 'canceled', canceled_at = now()
    where billable_attempt.tenant_id = previousAttempt.tenant_id
      and billable_attempt.project_id = previousAttempt.project_id
      and billable_attempt.id = previousAttempt.billable_attempt_id
      and billable_attempt.status = 'open';
  end if;
  insert into app.generation_attempts(
    tenant_id, project_id, id, job_id, billable_attempt_id, attempt_index, state, send_checkpoint,
    provider_config_id, submission_key, reservation_id, payload_hash
  ) values (
    previousAttempt.tenant_id, previousAttempt.project_id, replacementAttemptId, previousAttempt.job_id,
    replacementBillableAttemptId, replacementIndex, 'created', 'definitely_not_sent',
    previousAttempt.provider_config_id, replacementSubmissionKey, previousAttempt.reservation_id, previousAttempt.payload_hash
  );
  insert into app.outbox_events(tenant_id, id, route, payload_hash, state)
  values (
    previousAttempt.tenant_id::uuid, replacementOutboxEventId,
    'generation.submit', replacementOutboxPayloadHash, 'pending'
  );
  insert into app.generation_work_bindings(
    tenant_id, project_id, generation_attempt_id, outbox_tenant_id, outbox_event_id, route, payload_hash
  ) values (
    previousAttempt.tenant_id, previousAttempt.project_id, replacementAttemptId,
    previousAttempt.tenant_id::uuid, replacementOutboxEventId, 'generation.submit', replacementOutboxPayloadHash
  );
  insert into app.generation_absence_evidence_consumptions(
    tenant_id, project_id, evidence_hash, previous_attempt_id, replacement_attempt_id
  ) values (
    previousAttempt.tenant_id, previousAttempt.project_id, evidenceHash, previousAttempt.id, replacementAttemptId
  );
  return query select * from app.get_generation_attempt(replacementAttemptId);
end;
$$;

create table app.provider_webhook_receipts (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  provider_config_id text not null references app.provider_configs(id),
  external_id text not null,
  external_event_id text not null,
  receipt_id text not null,
  payload_hash text not null check (payload_hash like 'sha256:%'),
  raw_verifier_proof_hash text not null check (raw_verifier_proof_hash like 'sha256:%'),
  verifier_stage text not null check (verifier_stage = 'post_signature'),
  verified_at timestamptz not null default now(),
  consumed_at timestamptz,
  primary key (tenant_id, project_id, id),
  unique (provider_config_id, external_event_id),
  unique (receipt_id),
  foreign key (tenant_id, project_id) references app.projects(tenant_id, id)
);

alter table app.provider_webhook_receipts enable row level security;
alter table app.provider_webhook_receipts force row level security;

create table app.provider_events (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  attempt_id text not null,
  receipt_id text not null,
  provider_config_id text not null references app.provider_configs(id),
  external_id text not null,
  external_event_id text not null,
  payload_hash text not null check (payload_hash like 'sha256:%'),
  created_at timestamptz not null default now(),
  primary key (tenant_id, project_id, id),
  unique (provider_config_id, external_event_id),
  foreign key (tenant_id, project_id, attempt_id) references app.generation_attempts(tenant_id, project_id, id),
  foreign key (tenant_id, project_id, receipt_id) references app.provider_webhook_receipts(tenant_id, project_id, id)
);

alter table app.provider_events enable row level security;
alter table app.provider_events force row level security;

create table app.selections (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  shot_id text not null,
  asset_version_id text not null,
  source_job_id text not null,
  selected_output_state text not null check (selected_output_state = 'ready'),
  decision_hash text not null check (decision_hash like 'sha256:%'),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, project_id, id),
  unique (tenant_id, project_id, id),
  foreign key (tenant_id, project_id) references app.projects(tenant_id, id),
  foreign key (tenant_id, asset_version_id) references app.asset_versions(tenant_id, id),
  foreign key (tenant_id, project_id, source_job_id) references app.generation_jobs(tenant_id, project_id, id)
);

alter table app.selections enable row level security;
alter table app.selections force row level security;

create table app.selection_heads (
  tenant_id text not null,
  project_id text not null,
  shot_id text not null,
  current_selection_id text not null,
  head_version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, project_id, shot_id),
  foreign key (tenant_id, project_id, current_selection_id) references app.selections(tenant_id, project_id, id)
);

alter table app.selection_heads enable row level security;
alter table app.selection_heads force row level security;

create or replace function app.record_verified_provider_receipt(
  providerConfigId text,
  externalId text,
  receiptId text,
  payloadHash text,
  rawVerifierProofHash text,
  externalEventId text,
  tenantId text,
  projectId text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user <> 'comic_api' then raise exception 'PROVIDER_WEBHOOK_CALLER_FORBIDDEN'; end if;
  if payloadHash !~ '^sha256:[a-f0-9]{64}$' or rawVerifierProofHash !~ '^sha256:[a-f0-9]{64}$' then
    return null;
  end if;

  insert into app.provider_webhook_receipts(
    tenant_id, project_id, id, provider_config_id, external_id, external_event_id, receipt_id, payload_hash, raw_verifier_proof_hash, verifier_stage
  ) values (
    tenantId, projectId, receiptId, providerConfigId, externalId, externalEventId, receiptId, payloadHash, rawVerifierProofHash, 'post_signature'
  )
  on conflict (provider_config_id, external_event_id) do nothing;

  return receiptId;
end;
$$;

create or replace function app.bootstrap_verified_provider_event(
  providerConfigId text,
  externalId text,
  receiptId text,
  payloadHash text,
  rawVerifierProofHash text
  , externalEventId text
) returns table(tenant_id text, project_id text, attempt_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user <> 'comic_api' then raise exception 'PROVIDER_WEBHOOK_CALLER_FORBIDDEN'; end if;
  return query
  with matched_receipt as (
    update app.provider_webhook_receipts receipt
    set consumed_at = now()
    from app.generation_attempts attempt
    where receipt.provider_config_id = providerConfigId
      and receipt.external_id = externalId
      and receipt.external_event_id = externalEventId
      and receipt.receipt_id = receiptId
      and receipt.payload_hash = payloadHash
      and receipt.raw_verifier_proof_hash = rawVerifierProofHash
      and receipt.verifier_stage = 'post_signature'
      and receipt.consumed_at is null
      and attempt.provider_config_id = receipt.provider_config_id
      and attempt.external_id = receipt.external_id
      and attempt.tenant_id = receipt.tenant_id
      and attempt.project_id = receipt.project_id
    returning receipt.tenant_id, receipt.project_id, attempt.id as attempt_id,
      receipt.id as provider_receipt_id, receipt.provider_config_id, receipt.external_id, receipt.external_event_id, receipt.payload_hash
  ),
  inserted_event as (
    insert into app.provider_events(
      tenant_id, project_id, id, attempt_id, receipt_id, provider_config_id, external_id, external_event_id, payload_hash
    )
    select matched_receipt.tenant_id, matched_receipt.project_id, matched_receipt.provider_receipt_id,
      matched_receipt.attempt_id, matched_receipt.provider_receipt_id, matched_receipt.provider_config_id,
      matched_receipt.external_id, matched_receipt.external_event_id, matched_receipt.payload_hash
    from matched_receipt
    on conflict do nothing
    returning provider_events.tenant_id, provider_events.project_id, provider_events.attempt_id
  )
  select inserted_event.tenant_id, inserted_event.project_id, inserted_event.attempt_id
  from inserted_event
  limit 1;
end;
$$;

alter function app.record_verified_provider_receipt(text, text, text, text, text, text, text, text) owner to comic_security_owner;
alter function app.bootstrap_verified_provider_event(text, text, text, text, text, text) owner to comic_security_owner;
alter function app.reject_generation_work_binding_mutation() owner to comic_security_owner;
alter function app.reject_generation_attempt_evidence_mutation() owner to comic_security_owner;
alter function app.create_generation_attempt_work(text, text, text, text, text, integer, text, text, text, text, numeric, text, timestamptz, uuid, text, text) owner to comic_security_owner;
alter function app.get_generation_attempt(text) owner to comic_security_owner;
alter function app.get_generation_attempt_by_submission_key(text) owner to comic_security_owner;
alter function app.transition_generation_attempt(text, text, text, text, text, text, text, timestamptz, text) owner to comic_security_owner;
alter function app.begin_generation_cancellation(text, text) owner to comic_security_owner;
alter function app.mark_generation_cancellation_invoke_started(text, text) owner to comic_security_owner;
alter function app.complete_generation_cancellation(text, text, text, text, text) owner to comic_security_owner;
alter function app.create_replacement_generation_attempt(text, text, text, text, timestamptz, text) owner to comic_security_owner;
revoke all on function app.record_verified_provider_receipt(text, text, text, text, text, text, text, text) from public;
revoke all on function app.bootstrap_verified_provider_event(text, text, text, text, text, text) from public;
revoke all on table app.generation_work_bindings from public;
revoke all on table app.generation_attempt_evidence from public;
revoke all on table app.generation_absence_evidence_consumptions from public;
revoke all on function app.reject_generation_work_binding_mutation() from public;
revoke all on function app.reject_generation_attempt_evidence_mutation() from public;
revoke all on function app.create_generation_attempt_work(text, text, text, text, text, integer, text, text, text, text, numeric, text, timestamptz, uuid, text, text) from public;
revoke all on function app.get_generation_attempt(text) from public;
revoke all on function app.get_generation_attempt_by_submission_key(text) from public;
revoke all on function app.transition_generation_attempt(text, text, text, text, text, text, text, timestamptz, text) from public;
revoke all on function app.begin_generation_cancellation(text, text) from public;
revoke all on function app.mark_generation_cancellation_invoke_started(text, text) from public;
revoke all on function app.complete_generation_cancellation(text, text, text, text, text) from public;
revoke all on function app.create_replacement_generation_attempt(text, text, text, text, timestamptz, text) from public;
grant execute on function app.record_verified_provider_receipt(text, text, text, text, text, text, text, text) to comic_api;
grant execute on function app.bootstrap_verified_provider_event(text, text, text, text, text, text) to comic_api;
grant execute on function app.create_generation_attempt_work(text, text, text, text, text, integer, text, text, text, text, numeric, text, timestamptz, uuid, text, text) to comic_api;
grant execute on function app.get_generation_attempt(text) to comic_generation_worker;
grant execute on function app.get_generation_attempt_by_submission_key(text) to comic_generation_worker;
grant execute on function app.transition_generation_attempt(text, text, text, text, text, text, text, timestamptz, text) to comic_generation_worker;
grant execute on function app.begin_generation_cancellation(text, text) to comic_generation_worker;
grant execute on function app.mark_generation_cancellation_invoke_started(text, text) to comic_generation_worker;
grant execute on function app.complete_generation_cancellation(text, text, text, text, text) to comic_generation_worker;
grant execute on function app.create_replacement_generation_attempt(text, text, text, text, timestamptz, text) to comic_generation_worker;

comment on function app.bootstrap_verified_provider_event(text, text, text, text, text, text) is
  'Post-signature provider bootstrap derives tenant/project only from the matched GenerationAttempt; spoofed payload tenant/project is ignored.';

-- Task 26: durable provider-output ingest receipt state. The deterministic quarantine key
-- supports at-least-once fetch recovery and exactly-once downstream promotion; object and DB
-- writes are intentionally not claimed to be one external atomic transaction.
create table app.provider_output_ingest_receipts (
  instruction_id text primary key,
  quarantine_key text not null unique,
  state text not null check (state in ('pending','claimed','completed')) default 'pending',
  result_status text check (result_status in ('quarantined','refresh_required')),
  result_bytes bigint check (result_bytes is null or result_bytes >= 0),
  result_sha256 text check (result_sha256 is null or result_sha256 ~ '^sha256:[a-f0-9]{64}$'),
  claimed_at timestamptz,
  lease_until timestamptz,
  claim_token text,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (state = 'completed' and result_status is not null)
    or (state <> 'completed' and result_status is null and result_bytes is null and result_sha256 is null)
  ),
  check (
    result_status = 'quarantined' or (result_bytes is null and result_sha256 is null)
  )
);

alter table app.provider_output_ingest_receipts enable row level security;
alter table app.provider_output_ingest_receipts force row level security;

create or replace function app.claim_provider_output_ingest(
  p_instruction_id text
) returns table(state text, quarantine_key text, claim_token text, result_status text, result_bytes bigint, result_sha256 text)
language plpgsql
security definer
set search_path = ''
as $$
declare receiptRow app.provider_output_ingest_receipts%rowtype;
begin
  if session_user <> 'comic_media_worker' then raise exception 'PROVIDER_OUTPUT_INGEST_CALLER_FORBIDDEN'; end if;
  insert into app.provider_output_ingest_receipts(instruction_id, quarantine_key)
  values (p_instruction_id, 'quarantine/provider-output/' || p_instruction_id)
  on conflict (instruction_id) do nothing;

  select stored_receipt.* into receiptRow
  from app.provider_output_ingest_receipts stored_receipt
  where stored_receipt.instruction_id = p_instruction_id
  for update skip locked;
  if not found then return query select 'in_progress'::text, null::text, null::text, null::text, null::bigint, null::text; return; end if;
  if receiptRow.state = 'completed' then
    return query select receiptRow.state, receiptRow.quarantine_key, null::text, receiptRow.result_status, receiptRow.result_bytes, receiptRow.result_sha256;
    return;
  end if;
  if receiptRow.state = 'claimed' and receiptRow.lease_until >= now() then
    return query select 'in_progress'::text, null::text, null::text, null::text, null::bigint, null::text;
    return;
  end if;

  update app.provider_output_ingest_receipts stored_receipt
  set state = 'claimed', claimed_at = now(), lease_until = now() + interval '5 minutes',
    claim_token = pg_catalog.encode(public.gen_random_bytes(16), 'hex'), updated_at = now()
  where stored_receipt.instruction_id = p_instruction_id
  returning stored_receipt.* into receiptRow;
  return query select 'claimed'::text, receiptRow.quarantine_key, receiptRow.claim_token, null::text, null::bigint, null::text;
end;
$$;

create or replace function app.complete_provider_output_ingest(
  p_instruction_id text,
  p_claim_token text,
  p_result_status text,
  p_result_bytes bigint,
  p_result_sha256 text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user <> 'comic_media_worker' then raise exception 'PROVIDER_OUTPUT_INGEST_CALLER_FORBIDDEN'; end if;
  if p_result_status not in ('quarantined','refresh_required') then raise exception 'PROVIDER_OUTPUT_INGEST_RESULT_INVALID'; end if;
  if p_result_status = 'quarantined' and (p_result_bytes is null or p_result_sha256 !~ '^sha256:[a-f0-9]{64}$') then
    raise exception 'PROVIDER_OUTPUT_INGEST_QUARANTINE_RECEIPT_INVALID';
  end if;
  update app.provider_output_ingest_receipts stored_receipt
  set state = 'completed', result_status = p_result_status, result_bytes = p_result_bytes, result_sha256 = p_result_sha256,
    completed_at = now(), claim_token = null, lease_until = null, updated_at = now()
  where stored_receipt.instruction_id = p_instruction_id and stored_receipt.state = 'claimed'
    and stored_receipt.claim_token = p_claim_token and stored_receipt.lease_until >= now();
  if not found then raise exception 'PROVIDER_OUTPUT_INGEST_CLAIM_FENCED'; end if;
end;
$$;

create or replace function app.fail_provider_output_ingest(p_instruction_id text, p_claim_token text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user <> 'comic_media_worker' then raise exception 'PROVIDER_OUTPUT_INGEST_CALLER_FORBIDDEN'; end if;
  update app.provider_output_ingest_receipts stored_receipt
  set state = 'pending', claimed_at = null, claim_token = null, lease_until = null, updated_at = now()
  where stored_receipt.instruction_id = p_instruction_id and stored_receipt.state = 'claimed'
    and stored_receipt.claim_token = p_claim_token;
  if not found then raise exception 'PROVIDER_OUTPUT_INGEST_CLAIM_FENCED'; end if;
end;
$$;

alter function app.claim_provider_output_ingest(text) owner to comic_security_owner;
alter function app.complete_provider_output_ingest(text, text, text, bigint, text) owner to comic_security_owner;
alter function app.fail_provider_output_ingest(text, text) owner to comic_security_owner;
revoke all on table app.provider_output_ingest_receipts from public;
revoke all on function app.claim_provider_output_ingest(text) from public;
revoke all on function app.complete_provider_output_ingest(text, text, text, bigint, text) from public;
revoke all on function app.fail_provider_output_ingest(text, text) from public;
grant execute on function app.claim_provider_output_ingest(text) to comic_media_worker;
grant execute on function app.complete_provider_output_ingest(text, text, text, bigint, text) to comic_media_worker;
grant execute on function app.fail_provider_output_ingest(text, text) to comic_media_worker;
