-- Task 21: immutable assets, quarantined uploads and scoped remote ingest.

create table app.assets (
  tenant_id text not null, id text not null, project_id text not null,
  kind text not null check (kind in ('image','video','audio','document','font','other')),
  status text not null check (status in ('quarantined','scanning','ready','rejected','expired')),
  current_version_id text, created_at timestamptz not null default now(),
  primary key (tenant_id, id), unique (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id)
);

create table app.asset_versions (
  tenant_id text not null, id text not null, asset_id text not null, project_id text not null,
  sha256 text not null check (sha256 like 'sha256:%'), byte_size bigint not null check (byte_size >= 0),
  detected_mime text not null, media_metadata jsonb not null default '{}'::jsonb,
  rights_record_id text, moderation_record_id text, source_job_id text,
  status text not null check (status in ('quarantined','scanning','ready','rejected','expired')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id), unique (tenant_id, id),
  foreign key (tenant_id, asset_id) references app.assets (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id)
);

alter table app.assets add constraint assets_current_version_fk
  foreign key (tenant_id, current_version_id) references app.asset_versions (tenant_id, id);

create table app.asset_variants (
  tenant_id text not null, id text not null, asset_version_id text not null, project_id text not null,
  variant text not null check (variant in ('original','thumbnail','poster','proxy','waveform','mezzanine')),
  object_version_id text not null, sha256 text not null check (sha256 like 'sha256:%'),
  byte_size bigint not null check (byte_size >= 0), detected_mime text not null,
  status text not null check (status in ('quarantined','ready','rejected')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id), unique (tenant_id, id),
  unique (tenant_id, asset_version_id, variant),
  foreign key (tenant_id, asset_version_id) references app.asset_versions (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id)
);

create table app.upload_sessions (
  tenant_id text not null, id text not null, project_id text not null, asset_id text not null,
  status text not null check (status in ('created','uploading','completed','aborted','expired')),
  declared_mime text not null, declared_byte_size bigint not null check (declared_byte_size > 0),
  expires_at timestamptz not null, created_at timestamptz not null default now(),
  primary key (tenant_id, id), unique (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id),
  foreign key (tenant_id, asset_id) references app.assets (tenant_id, id)
);

alter table app.remote_ingest_instructions
  add column if not exists declared_mime text not null default 'application/octet-stream',
  add column if not exists lifecycle_state text not null default 'pending',
  add column if not exists request_sha256 text,
  add column if not exists consumed_at timestamptz;
update app.remote_ingest_instructions set request_sha256 = instruction_sha256 where request_sha256 is null;
alter table app.remote_ingest_instructions alter column request_sha256 set not null;
alter table app.remote_ingest_instructions add constraint remote_ingest_lifecycle_check
  check (lifecycle_state in ('pending','bootstrapped','fetching','consumed','failed','expired'));
create unique index remote_ingest_request_dedupe
  on app.remote_ingest_instructions (tenant_id, project_id, request_sha256);

create or replace function app.reject_asset_version_mutation() returns trigger
language plpgsql as $$
begin
  if new.byte_size <> old.byte_size or new.detected_mime <> old.detected_mime or new.sha256 <> old.sha256 then
    raise exception 'ASSET_VERSION_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger asset_versions_immutable_bytes before update on app.asset_versions
  for each row execute function app.reject_asset_version_mutation();

create or replace function app.reject_remote_ingest_request_mutation() returns trigger
language plpgsql as $$
begin
  if new.tenant_id <> old.tenant_id or new.project_id <> old.project_id
    or new.url <> old.url or new.request_sha256 <> old.request_sha256
    or new.max_bytes <> old.max_bytes or new.declared_mime <> old.declared_mime then
    raise exception 'REMOTE_INGEST_REQUEST_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger remote_ingest_request_immutable before update on app.remote_ingest_instructions
  for each row execute function app.reject_remote_ingest_request_mutation();

comment on table app.remote_ingest_instructions is 'Short-lived project-scoped locator; FORCE RLS and encrypted storage required. Never copy locator into queues, analytics, audit detail, object metadata or diagnostics.';
comment on column app.asset_variants.object_version_id is 'Opaque storage version; contains no title or original filename.';

alter table app.assets enable row level security; alter table app.assets force row level security;
alter table app.asset_versions enable row level security; alter table app.asset_versions force row level security;
alter table app.asset_variants enable row level security; alter table app.asset_variants force row level security;
alter table app.upload_sessions enable row level security; alter table app.upload_sessions force row level security;
alter table app.remote_ingest_instructions enable row level security; alter table app.remote_ingest_instructions force row level security;
