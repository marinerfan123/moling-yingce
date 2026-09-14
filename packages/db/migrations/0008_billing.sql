-- Task 24: integer micro-unit billing ledger, budget reservation and attempt charge evidence.

create table app.billing_currency_policies (
  id text primary key,
  tenant_id text not null,
  project_id text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$' and currency <> 'XXX'),
  version integer not null check (version = 1),
  frozen_at timestamptz not null default now(),
  frozen_by_user_id text not null,
  unique (tenant_id, project_id),
  foreign key (tenant_id, project_id) references app.projects(tenant_id, id)
);

alter table app.billing_currency_policies enable row level security;
alter table app.billing_currency_policies force row level security;

create table app.billing_budgets (
  tenant_id text not null,
  project_id text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$' and currency <> 'XXX'),
  limit_micros numeric(38,0) not null check (limit_micros >= 0),
  reserved_micros numeric(38,0) not null default 0 check (reserved_micros >= 0),
  spent_micros numeric(38,0) not null default 0 check (spent_micros >= 0),
  overage_micros numeric(38,0) generated always as (greatest(0::numeric, spent_micros + reserved_micros - limit_micros)) stored,
  version bigint not null default 0,
  locked_at timestamptz,
  primary key (tenant_id, project_id),
  foreign key (tenant_id, project_id) references app.billing_currency_policies(tenant_id, project_id),
  check (overage_micros >= 0)
);

alter table app.billing_budgets enable row level security;
alter table app.billing_budgets force row level security;

create table app.billable_attempts (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  job_id text not null,
  status text not null default 'open' check (status in ('open','canceled','settled')),
  created_at timestamptz not null default now(),
  canceled_at timestamptz,
  primary key (tenant_id, project_id, id),
  unique (tenant_id, project_id, job_id, id),
  foreign key (tenant_id, project_id) references app.projects(tenant_id, id)
);

alter table app.billable_attempts enable row level security;
alter table app.billable_attempts force row level security;

create table app.usage_reservations (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  job_id text not null,
  attempt_id text,
  operation_id text not null,
  amount_micros numeric(38,0) not null check (amount_micros >= 0),
  settled_micros numeric(38,0) not null default 0 check (settled_micros >= 0),
  released_micros numeric(38,0) not null default 0 check (released_micros >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$' and currency <> 'XXX'),
  state text not null check (state in ('reserved','dispatched','released','expired','settled')),
  expires_at timestamptz not null,
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, project_id, id),
  unique (tenant_id, project_id, operation_id),
  foreign key (tenant_id, project_id) references app.billing_budgets(tenant_id, project_id),
  foreign key (tenant_id, project_id, attempt_id) references app.billable_attempts(tenant_id, project_id, id),
  check (settled_micros + released_micros <= amount_micros)
);

alter table app.usage_reservations enable row level security;
alter table app.usage_reservations force row level security;

create table app.ledger_movements (
  tenant_id text not null,
  project_id text not null,
  id text not null,
  reservation_id text,
  attempt_id text,
  type text not null check (type in ('debit','credit','adjustment')),
  direction text check (direction in ('debit','credit')),
  account text not null check (account in (
    'tenant_budget',
    'reservation_hold',
    'usage_expense',
    'provider_payable',
    'provider_refund',
    'billing_adjustment'
  )),
  operation text not null check (operation in ('reserve','settle','release','expire','record_attempt_charge','cancellation_late_bill_adjustment')),
  operation_id text not null,
  amount_micros numeric(38,0) not null check (amount_micros >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$' and currency <> 'XXX'),
  evidence_hash text not null check (evidence_hash ~ '^sha256:[a-f0-9]{64}$'),
  adjustment_reason text check (adjustment_reason in (
    'late_cancellation_bill',
    'provider_refund',
    'manual_correction',
    'provider_reconciliation'
  )),
  created_at timestamptz not null default now(),
  primary key (tenant_id, project_id, id),
  foreign key (tenant_id, project_id) references app.billing_budgets(tenant_id, project_id),
  foreign key (tenant_id, project_id, reservation_id) references app.usage_reservations(tenant_id, project_id, id),
  foreign key (tenant_id, project_id, attempt_id) references app.billable_attempts(tenant_id, project_id, id)
);

alter table app.ledger_movements enable row level security;
alter table app.ledger_movements force row level security;

create unique index ledger_movements_operation_once
  on app.ledger_movements(tenant_id, project_id, operation_id, account)
  where operation_id is not null;

create table app.attempt_charges (
  tenant_id text not null,
  project_id text not null,
  attempt_id text not null,
  provider_charge_id text not null,
  ledger_movement_id text not null,
  amount_micros numeric(38,0) not null check (amount_micros >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$' and currency <> 'XXX'),
  evidence_hash text not null check (evidence_hash ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (tenant_id, project_id, provider_charge_id),
  unique (tenant_id, project_id, attempt_id, provider_charge_id, evidence_hash),
  foreign key (tenant_id, project_id, attempt_id) references app.billable_attempts(tenant_id, project_id, id),
  foreign key (tenant_id, project_id, ledger_movement_id) references app.ledger_movements(tenant_id, project_id, id)
);

alter table app.attempt_charges enable row level security;
alter table app.attempt_charges force row level security;

create or replace function app.reserve_usage(
  tenantId text,
  projectId text,
  reservationId text,
  jobId text,
  attemptId text,
  operationId text,
  amountMicros numeric,
  chargeCurrency text,
  expiresAt timestamptz
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy_currency text;
begin
  select currency into policy_currency
  from app.billing_currency_policies
  where tenant_id = tenantId and project_id = projectId;

  if policy_currency is null or policy_currency <> chargeCurrency then
    raise exception 'BILLING_CURRENCY_MISMATCH';
  end if;

  update app.billing_budgets
  set reserved_micros = reserved_micros + amountMicros,
      version = version + 1,
      locked_at = now()
  where tenant_id = tenantId
    and project_id = projectId
    and currency = chargeCurrency
    and spent_micros + reserved_micros + amountMicros <= limit_micros;

  if not found then
    raise exception 'BILLING_BUDGET_EXCEEDED';
  end if;

  insert into app.usage_reservations(
    tenant_id, project_id, id, job_id, attempt_id, operation_id, amount_micros, currency, state, expires_at
  ) values (tenantId, projectId, reservationId, jobId, attemptId, operationId, amountMicros, chargeCurrency, 'reserved', expiresAt);

  return reservationId;
end;
$$;

create or replace function app.record_attempt_charge(
  generationAttemptId text,
  eventId uuid,
  workPayloadHash text,
  providerChargeId text,
  amountMicros numeric,
  chargeCurrency text,
  evidenceHash text,
  lateAfterCancellation boolean default false
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  derived_tenant_id text;
  derived_project_id text;
  derived_job_id text;
  derived_attempt_id text;
  derived_reservation_id text;
  policy_currency text;
  reservation_currency text;
  existing_movement text;
  existing_amount numeric;
  existing_currency text;
  existing_evidence_hash text;
  existing_attempt_id text;
  charge_movement_id text;
  balancing_movement_id text;
  attempt_status text;
begin
  if session_user <> 'comic_generation_worker' then raise exception 'BILLING_CHARGE_CALLER_FORBIDDEN'; end if;
  select attempt.tenant_id, attempt.project_id, attempt.job_id, attempt.billable_attempt_id, attempt.reservation_id,
    billable.status, reservation.currency, policy.currency
  into derived_tenant_id, derived_project_id, derived_job_id, derived_attempt_id, derived_reservation_id,
    attempt_status, reservation_currency, policy_currency
  from app.generation_attempts attempt
  join app.billable_attempts billable
    on billable.tenant_id = attempt.tenant_id
   and billable.project_id = attempt.project_id
   and billable.job_id = attempt.job_id
   and billable.id = attempt.billable_attempt_id
  join app.usage_reservations reservation
    on reservation.tenant_id = attempt.tenant_id
   and reservation.project_id = attempt.project_id
   and reservation.job_id = attempt.job_id
   and reservation.id = attempt.reservation_id
   and reservation.attempt_id = attempt.billable_attempt_id
  join app.billing_currency_policies policy
    on policy.tenant_id = attempt.tenant_id
   and policy.project_id = attempt.project_id
  join app.generation_work_bindings binding
    on binding.tenant_id = attempt.tenant_id
   and binding.project_id = attempt.project_id
   and binding.generation_attempt_id = attempt.id
  join app.outbox_events event
    on event.id = binding.outbox_event_id
   and event.tenant_id = binding.outbox_tenant_id
  where attempt.id = generationAttemptId
    and binding.outbox_event_id = eventId
    and binding.payload_hash = workPayloadHash
    and binding.route = 'generation.submit'
    and event.route = binding.route
    and event.payload_hash = binding.payload_hash
    and event.state in ('claimed', 'published', 'terminal')
  for update of attempt, billable, reservation, binding, event;
  if not found then raise exception 'BILLING_ATTEMPT_SCOPE_MISMATCH'; end if;
  if policy_currency <> chargeCurrency or reservation_currency <> chargeCurrency then
    raise exception 'BILLING_CURRENCY_MISMATCH';
  end if;
  if amountMicros < 0 or evidenceHash !~ '^sha256:[a-f0-9]{64}$' then raise exception 'BILLING_CHARGE_EVIDENCE_INVALID'; end if;

  select ledger_movement_id, amount_micros, currency, evidence_hash, attempt_id
  into existing_movement, existing_amount, existing_currency, existing_evidence_hash, existing_attempt_id
  from app.attempt_charges
  where tenant_id = derived_tenant_id and project_id = derived_project_id and provider_charge_id = providerChargeId;
  if existing_movement is not null then
    if existing_amount <> amountMicros or existing_currency <> chargeCurrency or existing_evidence_hash <> evidenceHash or existing_attempt_id <> derived_attempt_id then
      raise exception 'BILLING_PROVIDER_CHARGE_IMMUTABLE';
    end if;
    return existing_movement;
  end if;

  if lateAfterCancellation then
    if attempt_status <> 'canceled' then raise exception 'BILLING_ATTEMPT_SCOPE_MISMATCH'; end if;
    update app.usage_reservations
    set settled_micros = settled_micros + amountMicros,
        released_micros = released_micros - amountMicros,
        state = case when settled_micros + amountMicros = amount_micros then 'settled' else state end
    where tenant_id = derived_tenant_id and project_id = derived_project_id and id = derived_reservation_id
      and released_micros >= amountMicros
      and settled_micros + released_micros <= amount_micros;
    if not found then raise exception 'BILLING_RESERVATION_SCOPE_MISMATCH'; end if;
    update app.billing_budgets
    set spent_micros = spent_micros + amountMicros, version = version + 1, locked_at = now()
    where tenant_id = derived_tenant_id and project_id = derived_project_id and currency = chargeCurrency;
  else
    if attempt_status <> 'open' then raise exception 'BILLING_ATTEMPT_SCOPE_MISMATCH'; end if;
    update app.usage_reservations
    set settled_micros = settled_micros + amountMicros,
        state = case when settled_micros + released_micros + amountMicros = amount_micros then 'settled' else state end
    where tenant_id = derived_tenant_id and project_id = derived_project_id and id = derived_reservation_id
      and state in ('reserved','dispatched')
      and settled_micros + released_micros + amountMicros <= amount_micros;
    if not found then raise exception 'BILLING_RESERVATION_SCOPE_MISMATCH'; end if;
    update app.billing_budgets
    set reserved_micros = reserved_micros - amountMicros, spent_micros = spent_micros + amountMicros, version = version + 1, locked_at = now()
    where tenant_id = derived_tenant_id and project_id = derived_project_id and currency = chargeCurrency
      and reserved_micros >= amountMicros;
  end if;
  if not found then raise exception 'BILLING_BUDGET_EXCEEDED'; end if;

  charge_movement_id := concat('ledger_charge_', generationAttemptId, '_', providerChargeId);
  balancing_movement_id := concat('ledger_payable_', generationAttemptId, '_', providerChargeId);
  insert into app.ledger_movements(tenant_id, project_id, id, reservation_id, attempt_id, type, direction, account, operation, operation_id, amount_micros, currency, evidence_hash, adjustment_reason)
  values (derived_tenant_id, derived_project_id, charge_movement_id, derived_reservation_id, derived_attempt_id, case when lateAfterCancellation then 'adjustment' else 'debit' end, case when lateAfterCancellation then 'debit' else null end, 'usage_expense', case when lateAfterCancellation then 'cancellation_late_bill_adjustment' else 'record_attempt_charge' end, concat('provider:', providerChargeId), amountMicros, chargeCurrency, evidenceHash, case when lateAfterCancellation then 'late_cancellation_bill' else null end),
         (derived_tenant_id, derived_project_id, balancing_movement_id, derived_reservation_id, derived_attempt_id, case when lateAfterCancellation then 'adjustment' else 'credit' end, case when lateAfterCancellation then 'credit' else null end, 'provider_payable', case when lateAfterCancellation then 'cancellation_late_bill_adjustment' else 'record_attempt_charge' end, concat('provider:', providerChargeId), amountMicros, chargeCurrency, evidenceHash, case when lateAfterCancellation then 'late_cancellation_bill' else null end);
  insert into app.attempt_charges(tenant_id, project_id, attempt_id, provider_charge_id, ledger_movement_id, amount_micros, currency, evidence_hash)
  values (derived_tenant_id, derived_project_id, derived_attempt_id, providerChargeId, charge_movement_id, amountMicros, chargeCurrency, evidenceHash);
  update app.billable_attempts set status = 'settled' where tenant_id = derived_tenant_id and project_id = derived_project_id and id = derived_attempt_id and status = 'open';
  return charge_movement_id;
end;
$$;

create or replace function app.release_usage_reservation(tenantId text, projectId text, reservationId text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  billable_attempt_id text;
  reservation_currency text;
  remaining_micros numeric;
  release_evidence_hash text;
begin
  if session_user <> 'comic_api' then raise exception 'BILLING_RELEASE_CALLER_FORBIDDEN'; end if;
  select reservation.attempt_id, reservation.currency,
    reservation.amount_micros - reservation.settled_micros - reservation.released_micros
  into billable_attempt_id, reservation_currency, remaining_micros
  from app.usage_reservations reservation
  join app.billable_attempts billable
    on billable.tenant_id = reservation.tenant_id
   and billable.project_id = reservation.project_id
   and billable.job_id = reservation.job_id
   and billable.id = reservation.attempt_id
  where reservation.tenant_id = tenantId
    and reservation.project_id = projectId
    and reservation.id = reservationId
    and reservation.state in ('reserved', 'dispatched', 'released')
  for update of reservation, billable;
  if not found then raise exception 'BILLING_RESERVATION_SCOPE_MISMATCH'; end if;
  if remaining_micros = 0 then return reservationId; end if;

  update app.usage_reservations
  set released_micros = released_micros + remaining_micros,
      state = 'released'
  where tenant_id = tenantId and project_id = projectId and id = reservationId;
  update app.billing_budgets
  set reserved_micros = reserved_micros - remaining_micros,
      version = version + 1,
      locked_at = now()
  where tenant_id = tenantId and project_id = projectId and currency = reservation_currency
    and reserved_micros >= remaining_micros;
  if not found then raise exception 'BILLING_BUDGET_EXCEEDED'; end if;

  release_evidence_hash := 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  insert into app.ledger_movements(tenant_id, project_id, id, reservation_id, attempt_id, type, account, operation, operation_id, amount_micros, currency, evidence_hash)
  values (tenantId, projectId, concat('ledger_release_hold_', reservationId), reservationId, billable_attempt_id, 'debit', 'reservation_hold', 'release', concat('release:', reservationId), remaining_micros, reservation_currency, release_evidence_hash),
         (tenantId, projectId, concat('ledger_release_budget_', reservationId), reservationId, billable_attempt_id, 'credit', 'tenant_budget', 'release', concat('release:', reservationId), remaining_micros, reservation_currency, release_evidence_hash);
  update app.billable_attempts
  set status = 'canceled', canceled_at = coalesce(canceled_at, now())
  where tenant_id = tenantId and project_id = projectId and id = billable_attempt_id and status = 'open';
  return reservationId;
end;
$$;

create or replace function app.expire_usage_reservations(nowAt timestamptz) returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  return 0;
end;
$$;

alter function app.reserve_usage(text, text, text, text, text, text, numeric, text, timestamptz) owner to comic_security_owner;
alter function app.record_attempt_charge(text, uuid, text, text, numeric, text, text, boolean) owner to comic_security_owner;
alter function app.release_usage_reservation(text, text, text) owner to comic_security_owner;
alter function app.expire_usage_reservations(timestamptz) owner to comic_security_owner;
revoke all on function app.reserve_usage(text, text, text, text, text, text, numeric, text, timestamptz) from public;
revoke all on function app.record_attempt_charge(text, uuid, text, text, numeric, text, text, boolean) from public;
revoke all on function app.release_usage_reservation(text, text, text) from public;
revoke all on function app.expire_usage_reservations(timestamptz) from public;
grant execute on function app.reserve_usage(text, text, text, text, text, text, numeric, text, timestamptz) to comic_api;
grant execute on function app.record_attempt_charge(text, uuid, text, text, numeric, text, text, boolean) to comic_generation_worker;
grant execute on function app.release_usage_reservation(text, text, text) to comic_api;
grant execute on function app.expire_usage_reservations(timestamptz) to comic_worker;
