create schema if not exists app authorization comic_migrator;

create extension if not exists pgcrypto;

create table app.tenants (
  tenant_id uuid primary key default gen_random_uuid(),
  id uuid not null generated always as (tenant_id) stored,
  name text not null,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table app.users (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  issuer text not null,
  subject text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (issuer, subject, tenant_id),
  foreign key (tenant_id, tenant_id) references app.tenants (tenant_id, id)
);

create table app.memberships (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, user_id) references app.users (tenant_id, id)
);

create table app.projects (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  name text not null,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, tenant_id) references app.tenants (tenant_id, id)
);

create table app.project_memberships (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id),
  foreign key (tenant_id, user_id) references app.users (tenant_id, id)
);

create table app.project_policies (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  policy jsonb not null,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id)
);

create table app.beta_access_entries (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  subject_hash text not null,
  state text not null check (state in ('granted','revoked','expired')),
  inviter_user_id uuid,
  reason text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, tenant_id) references app.tenants (tenant_id, id)
);

alter table app.tenants enable row level security;
alter table app.tenants force row level security;
alter table app.users enable row level security;
alter table app.users force row level security;
alter table app.memberships enable row level security;
alter table app.memberships force row level security;
alter table app.projects enable row level security;
alter table app.projects force row level security;
alter table app.project_memberships enable row level security;
alter table app.project_memberships force row level security;
alter table app.project_policies enable row level security;
alter table app.project_policies force row level security;
alter table app.beta_access_entries enable row level security;
alter table app.beta_access_entries force row level security;

create policy tenant_isolation_tenants on app.tenants using (tenant_id::text = current_setting('app.tenant_id', true));
create policy tenant_isolation_users on app.users using (tenant_id::text = current_setting('app.tenant_id', true));
create policy tenant_isolation_memberships on app.memberships using (tenant_id::text = current_setting('app.tenant_id', true));
create policy tenant_isolation_projects on app.projects using (tenant_id::text = current_setting('app.tenant_id', true));
create policy tenant_isolation_project_memberships on app.project_memberships using (tenant_id::text = current_setting('app.tenant_id', true));
create policy tenant_isolation_project_policies on app.project_policies using (tenant_id::text = current_setting('app.tenant_id', true));
create policy tenant_isolation_beta_access_entries on app.beta_access_entries using (tenant_id::text = current_setting('app.tenant_id', true));

create or replace function app.bootstrap_http_tenant_scope(issuer text, subject text, verified_tenant_claim uuid, request_id text)
returns table (tenant_id uuid, subject_text text, request_id_text text, nonce text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    select app.users.tenant_id, app.users.subject, request_id, pg_catalog.encode(public.gen_random_bytes(24), 'hex')
    from app.users
    where app.users.issuer = bootstrap_http_tenant_scope.issuer
      and app.users.subject = bootstrap_http_tenant_scope.subject
      and app.users.tenant_id = verified_tenant_claim
    limit 1;
end;
$$;

alter function app.bootstrap_http_tenant_scope(text,text,uuid,text) owner to comic_security_owner;
revoke all on function app.bootstrap_http_tenant_scope(text,text,uuid,text) from public;
grant execute on function app.bootstrap_http_tenant_scope(text,text,uuid,text) to comic_api;

create or replace function app.bootstrap_http_project_scope(tenant_scope_nonce text, project_id uuid, request_id text)
returns table (tenant_id uuid, project_id uuid, request_id_text text, nonce text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query select app.projects.tenant_id, app.projects.id, request_id, tenant_scope_nonce
  from app.projects
  where app.projects.id = project_id
  limit 1;
end;
$$;

alter function app.bootstrap_http_project_scope(text,uuid,text) owner to comic_security_owner;
revoke all on function app.bootstrap_http_project_scope(text,uuid,text) from public;
grant execute on function app.bootstrap_http_project_scope(text,uuid,text) to comic_api;
