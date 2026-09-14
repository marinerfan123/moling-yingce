-- Task 10: Project, Episode, restricted Canvas session and narrative revision authority.
-- This migration is intentionally explicit because later modules must fail closed when
-- a lifecycle table is not cataloged for copy/archive/snapshot policy.

alter table app.projects add column if not exists title text not null default 'Untitled project';
alter table app.projects add column if not exists owner_user_id text;
alter table app.projects add column if not exists archived_at timestamptz;
alter table app.projects add column if not exists created_at timestamptz not null default now();

create table app.project_heads (
  tenant_id text not null,
  id text not null,
  project_id text not null,
  head_epoch bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, project_id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id)
);

create table app.episodes (
  tenant_id text not null,
  id text not null,
  project_id text not null,
  title text not null,
  ordinal integer not null check (ordinal > 0),
  canvas_id text not null,
  timeline_id text not null,
  script_id text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, id),
  unique (tenant_id, project_id, ordinal),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id)
);

create table app.canvases (
  tenant_id text not null,
  id text not null,
  project_id text not null,
  episode_id text not null,
  schema_version integer not null default 1,
  document_epoch bigint not null default 1,
  active_revision_id text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id),
  foreign key (tenant_id, episode_id) references app.episodes (tenant_id, id)
);

create table app.canvas_session_revisions (
  tenant_id text not null,
  canvas_id text not null,
  session_revision bigint not null default 1,
  retired_at timestamptz,
  primary key (tenant_id, canvas_id),
  foreign key (tenant_id, canvas_id) references app.canvases (tenant_id, id)
);

create table app.timeline_headers (
  tenant_id text not null,
  id text not null,
  project_id text not null,
  episode_id text not null,
  schema_version integer not null default 1,
  head_revision_id text,
  primary key (tenant_id, id),
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id),
  foreign key (tenant_id, episode_id) references app.episodes (tenant_id, id)
);

create table app.scripts (
  tenant_id text not null,
  id text not null,
  project_id text not null,
  episode_id text not null,
  head_revision_id text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id),
  foreign key (tenant_id, episode_id) references app.episodes (tenant_id, id)
);

create table app.script_sources (
  tenant_id text not null,
  id text not null,
  script_id text not null,
  source_sha256 text not null check (source_sha256 like 'sha256:%'),
  utf8_bytes bytea not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, id),
  foreign key (tenant_id, script_id) references app.scripts (tenant_id, id)
);

create table app.script_revisions (
  tenant_id text not null,
  id text not null,
  script_id text not null,
  parent_revision_id text,
  source_id text not null,
  canonical_sha256 text not null check (canonical_sha256 like 'sha256:%'),
  operation_id text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, script_id, operation_id),
  foreign key (tenant_id, script_id) references app.scripts (tenant_id, id),
  foreign key (tenant_id, source_id) references app.script_sources (tenant_id, id)
);

create table app.script_revision_scenes (
  tenant_id text not null,
  revision_id text not null,
  scene_id text not null,
  ordinal integer not null,
  title text not null,
  primary key (tenant_id, revision_id, scene_id),
  foreign key (tenant_id, revision_id) references app.script_revisions (tenant_id, id)
);

create table app.script_revision_beats (
  tenant_id text not null,
  revision_id text not null,
  beat_id text not null,
  scene_id text not null,
  ordinal integer not null,
  summary text not null,
  primary key (tenant_id, revision_id, beat_id),
  foreign key (tenant_id, revision_id, scene_id) references app.script_revision_scenes (tenant_id, revision_id, scene_id)
);

create table app.script_revision_shots (
  tenant_id text not null,
  revision_id text not null,
  shot_id text not null,
  beat_id text not null,
  ordinal integer not null,
  description text not null,
  primary key (tenant_id, revision_id, shot_id),
  foreign key (tenant_id, revision_id, beat_id) references app.script_revision_beats (tenant_id, revision_id, beat_id)
);

create table app.script_revision_lines (
  tenant_id text not null,
  revision_id text not null,
  line_id text not null,
  shot_id text not null,
  ordinal integer not null,
  speaker text not null,
  text text not null,
  primary key (tenant_id, revision_id, line_id),
  foreign key (tenant_id, revision_id, shot_id) references app.script_revision_shots (tenant_id, revision_id, shot_id)
);

create table app.episode_copy_previews (
  tenant_id text not null,
  id text not null,
  project_id text not null,
  source_episode_id text not null,
  source_head_hash text not null check (source_head_hash like 'sha256:%'),
  policy_hash text not null check (policy_hash like 'sha256:%'),
  copy_policy_version integer not null check (copy_policy_version = 1),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (tenant_id, id),
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id),
  foreign key (tenant_id, source_episode_id) references app.episodes (tenant_id, id)
);

create table app.episode_copy_policy_catalog (
  tenant_id text not null default 'tenant_catalog',
  id text not null,
  copy_policy_version integer not null check (copy_policy_version = 1),
  table_name text not null,
  policy text not null check (policy in ('copy_new_id','reuse_project_ref','exclude','requires_contributor')),
  required_contributor text,
  primary key (tenant_id, id),
  unique (tenant_id, id)
);

create table app.episode_archive_blockers (
  tenant_id text not null,
  id text not null,
  project_id text not null,
  episode_id text not null,
  blocker_kind text not null,
  blocker_ref text not null,
  terminal boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id),
  foreign key (tenant_id, episode_id) references app.episodes (tenant_id, id)
);

alter table app.project_heads enable row level security;
alter table app.project_heads force row level security;
alter table app.episodes enable row level security;
alter table app.episodes force row level security;
alter table app.canvases enable row level security;
alter table app.canvases force row level security;
alter table app.canvas_session_revisions enable row level security;
alter table app.canvas_session_revisions force row level security;
alter table app.timeline_headers enable row level security;
alter table app.timeline_headers force row level security;
alter table app.scripts enable row level security;
alter table app.scripts force row level security;
alter table app.script_sources enable row level security;
alter table app.script_sources force row level security;
alter table app.script_revisions enable row level security;
alter table app.script_revisions force row level security;
alter table app.script_revision_scenes enable row level security;
alter table app.script_revision_scenes force row level security;
alter table app.script_revision_beats enable row level security;
alter table app.script_revision_beats force row level security;
alter table app.script_revision_shots enable row level security;
alter table app.script_revision_shots force row level security;
alter table app.script_revision_lines enable row level security;
alter table app.script_revision_lines force row level security;
alter table app.episode_copy_previews enable row level security;
alter table app.episode_copy_previews force row level security;
alter table app.episode_copy_policy_catalog enable row level security;
alter table app.episode_copy_policy_catalog force row level security;
alter table app.episode_archive_blockers enable row level security;
alter table app.episode_archive_blockers force row level security;
