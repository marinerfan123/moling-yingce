-- Task 11: immutable rights, moderation, disclosure, waiver and remote-ingest safety records.

create table app.rights_records (
  tenant_id text not null,
  id text not null,
  project_id text not null,
  subject_kind text not null,
  subject_id text not null,
  version integer not null check (version > 0),
  owner text not null,
  license text not null,
  territory text[] not null,
  expires_at timestamptz,
  evidence_sha256 text not null check (evidence_sha256 like 'sha256:%'),
  decision text not null check (decision in ('approved','restricted','rejected','expired')),
  reason text not null,
  actor_user_id text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, id),
  unique (tenant_id, project_id, subject_kind, subject_id, version),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id)
);

create table app.moderation_records (
  tenant_id text not null,
  id text not null,
  project_id text not null,
  subject_kind text not null,
  subject_id text not null,
  version integer not null check (version > 0),
  stage text not null check (stage in ('input','output')),
  checker text not null,
  evidence_sha256 text not null check (evidence_sha256 like 'sha256:%'),
  decision text not null check (decision in ('approved','needs_review','rejected')),
  reason text not null,
  actor_user_id text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, id),
  unique (tenant_id, project_id, subject_kind, subject_id, version, stage),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id)
);

create table app.ai_disclosure_policies (
  tenant_id text not null,
  id text not null,
  project_id text not null,
  target_profile text not null,
  version integer not null check (version > 0),
  visible_overlay boolean not null,
  machine_readable_metadata boolean not null,
  sidecar boolean not null,
  label_text text not null check (label_text = '本内容包含AI生成元素'),
  font_version_id text not null,
  placement text not null check (placement in ('top-left','top-right','bottom-left','bottom-right')),
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms > start_ms),
  signed boolean not null check (signed),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, id),
  unique (tenant_id, project_id, target_profile, version),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id)
);

create table app.approval_gate_policies (
  tenant_id text not null,
  id text not null,
  project_id text not null,
  version integer not null check (version > 0),
  require_rights boolean not null check (require_rights),
  require_moderation boolean not null check (require_moderation),
  require_ai_disclosure boolean not null check (require_ai_disclosure),
  disclosure_policy_id text not null,
  signed boolean not null check (signed),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, id),
  unique (tenant_id, project_id, version),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id),
  foreign key (tenant_id, disclosure_policy_id) references app.ai_disclosure_policies (tenant_id, id)
);

create table app.governance_waivers (
  tenant_id text not null,
  id text not null,
  project_id text not null,
  subject_kind text not null,
  subject_id text not null,
  waived_requirement text not null check (waived_requirement in ('editorial_review','optional_brand_review')),
  reason text not null,
  actor_user_id text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id)
);

create table app.provider_output_provenance (
  tenant_id text not null,
  id text not null,
  project_id text not null,
  asset_version_id text not null,
  provider_class text not null,
  prompt_sha256 text not null check (prompt_sha256 like 'sha256:%'),
  output_sha256 text not null check (output_sha256 like 'sha256:%'),
  ai_generated boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id)
);

create table app.remote_ingest_instructions (
  tenant_id text not null,
  id text not null,
  project_id text not null,
  url text not null,
  expected_sha256 text check (expected_sha256 like 'sha256:%'),
  max_bytes bigint not null check (max_bytes > 0),
  instruction_sha256 text not null check (instruction_sha256 like 'sha256:%'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id)
);

alter table app.rights_records enable row level security;
alter table app.rights_records force row level security;
alter table app.moderation_records enable row level security;
alter table app.moderation_records force row level security;
alter table app.ai_disclosure_policies enable row level security;
alter table app.ai_disclosure_policies force row level security;
alter table app.approval_gate_policies enable row level security;
alter table app.approval_gate_policies force row level security;
alter table app.governance_waivers enable row level security;
alter table app.governance_waivers force row level security;
alter table app.provider_output_provenance enable row level security;
alter table app.provider_output_provenance force row level security;
alter table app.remote_ingest_instructions enable row level security;
alter table app.remote_ingest_instructions force row level security;
