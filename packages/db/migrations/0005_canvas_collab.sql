-- Task 13: durable Canvas collaboration, projection ordering and compaction safety.

create table app.canvas_room_leases (
  tenant_id text not null,
  canvas_id text not null,
  owner_pod_id text not null,
  room_epoch bigint not null,
  lease_until timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, canvas_id),
  foreign key (tenant_id, canvas_id) references app.canvases (tenant_id, id)
);

create table app.canvas_durable_revisions (
  tenant_id text not null,
  id text not null,
  canvas_id text not null,
  document_epoch bigint not null,
  durable_seq bigint not null,
  state_vector_sha256 text not null check (state_vector_sha256 like 'sha256:%'),
  update_sha256 text not null check (update_sha256 like 'sha256:%'),
  content_object_id text not null,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, canvas_id, document_epoch, durable_seq),
  foreign key (tenant_id, canvas_id) references app.canvases (tenant_id, id)
);

create table app.canvas_projection_counters (
  tenant_id text not null,
  canvas_id text not null,
  document_epoch bigint not null,
  last_projection_seq bigint not null default 0,
  primary key (tenant_id, canvas_id, document_epoch),
  foreign key (tenant_id, canvas_id) references app.canvases (tenant_id, id)
);

create table app.canvas_projection_markers (
  tenant_id text not null,
  id text not null,
  canvas_id text not null,
  document_epoch bigint not null,
  projection_seq bigint not null,
  source_event_id text not null,
  operation_id text not null,
  update_sha256 text not null check (update_sha256 like 'sha256:%'),
  durable_revision_id text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, canvas_id, document_epoch, projection_seq),
  foreign key (tenant_id, canvas_id) references app.canvases (tenant_id, id)
);

create table app.canvas_projection_receipts (
  tenant_id text not null,
  id text not null,
  canvas_id text not null,
  document_epoch bigint not null,
  projection_seq bigint not null,
  receipt_state text not null check (receipt_state in ('applied','superseded','dead_letter')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  unique (tenant_id, canvas_id, document_epoch, projection_seq),
  foreign key (tenant_id, canvas_id) references app.canvases (tenant_id, id)
);

create table app.canvas_compaction_watermarks (
  tenant_id text not null,
  canvas_id text not null,
  document_epoch bigint not null,
  finalized_projection_seq bigint not null default 0,
  finalized_at timestamptz,
  primary key (tenant_id, canvas_id, document_epoch),
  foreign key (tenant_id, canvas_id) references app.canvases (tenant_id, id)
);

alter table app.canvas_room_leases enable row level security;
alter table app.canvas_room_leases force row level security;
alter table app.canvas_durable_revisions enable row level security;
alter table app.canvas_durable_revisions force row level security;
alter table app.canvas_projection_counters enable row level security;
alter table app.canvas_projection_counters force row level security;
alter table app.canvas_projection_markers enable row level security;
alter table app.canvas_projection_markers force row level security;
alter table app.canvas_projection_receipts enable row level security;
alter table app.canvas_projection_receipts force row level security;
alter table app.canvas_compaction_watermarks enable row level security;
alter table app.canvas_compaction_watermarks force row level security;
