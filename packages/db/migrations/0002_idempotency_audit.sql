create table app.idempotency_keys (
  tenant_id uuid not null,
  actor_id uuid not null,
  operation text not null,
  key text not null,
  fingerprint_hash text not null,
  status integer not null,
  response_headers jsonb not null default '{}',
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, actor_id, operation, key),
  foreign key (tenant_id, tenant_id) references app.tenants (tenant_id, id)
);

create table app.audit_events (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  actor_id uuid,
  object_type text not null,
  object_id text not null,
  action text not null,
  version text not null,
  trace_id text not null,
  ip_class text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, tenant_id) references app.tenants (tenant_id, id)
);

create table app.outbox_events (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  route text not null,
  payload_hash text not null,
  state text not null check (state in ('pending','claimed','published','dead_letter','terminal')),
  claim_token text,
  lease_until timestamptz,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, tenant_id) references app.tenants (tenant_id, id)
);

create table app.outbox_broker_attempts (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  event_id uuid not null,
  broker_identity text not null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, event_id) references app.outbox_events (tenant_id, id)
);

create table app.outbox_repairs (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  event_id uuid not null,
  expected_attempt integer not null,
  reason text not null,
  actor_id uuid,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, event_id) references app.outbox_events (tenant_id, id)
);

create table app.consumer_receipts (
  tenant_id uuid not null,
  consumer_name text not null,
  event_id uuid not null,
  terminal_at timestamptz not null default now(),
  primary key (tenant_id, consumer_name, event_id),
  foreign key (tenant_id, event_id) references app.outbox_events (tenant_id, id)
);

create table app.analytics_events (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  metric text not null,
  trace_id text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

create table app.analytics_daily_aggregates (
  tenant_id uuid not null,
  day date not null,
  metric text not null,
  value numeric not null,
  primary key (tenant_id, day, metric)
);

alter table app.idempotency_keys enable row level security;
alter table app.idempotency_keys force row level security;
alter table app.audit_events enable row level security;
alter table app.audit_events force row level security;
alter table app.outbox_events enable row level security;
alter table app.outbox_events force row level security;
alter table app.consumer_receipts enable row level security;
alter table app.consumer_receipts force row level security;

create or replace function app.claim_outbox(max_rows integer, claimant text, lease_ms integer)
returns table (event_id uuid, route text, payload_hash text, claim_token text)
language sql
security definer
set search_path = ''
as $$
  update app.outbox_events
  set state = 'claimed',
      claim_token = pg_catalog.encode(public.gen_random_bytes(16), 'hex'),
      lease_until = now() + make_interval(secs => lease_ms / 1000),
      attempt_count = attempt_count + 1
  where id in (
    select id from app.outbox_events
    where state in ('pending','claimed')
      and (lease_until is null or lease_until < now())
      and next_attempt_at <= now()
    order by created_at
    limit least(max_rows, 100)
    for update skip locked
  )
  returning id, route, payload_hash, claim_token;
$$;

alter function app.claim_outbox(integer,text,integer) owner to comic_security_owner;
revoke all on function app.claim_outbox(integer,text,integer) from public;
grant execute on function app.claim_outbox(integer,text,integer) to comic_dispatcher;

create or replace function app.requeue_outbox(event_id uuid, expected_attempt integer, reason text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into app.outbox_repairs(tenant_id,event_id,expected_attempt,reason)
  select tenant_id, id, expected_attempt, reason from app.outbox_events
  where id = event_id and attempt_count = expected_attempt
  returning id;
$$;

alter function app.requeue_outbox(uuid,integer,text) owner to comic_security_owner;
revoke all on function app.requeue_outbox(uuid,integer,text) from public;
grant execute on function app.requeue_outbox(uuid,integer,text) to comic_operations;
