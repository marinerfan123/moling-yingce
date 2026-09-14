-- Task 23: provider configuration, model catalog and pre-signature webhook routing.

create table app.provider_configs (
  id text primary key,
  provider_key text not null,
  route_token_hash text not null,
  submit_secret_ref text not null,
  webhook_verification_secret_ref text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (provider_key),
  unique (provider_key, route_token_hash)
);

revoke all on table app.provider_configs from public;
alter table app.provider_configs enable row level security;
alter table app.provider_configs force row level security;

create table app.model_catalog (
  id text primary key,
  provider_config_id text not null references app.provider_configs(id),
  provider_key text not null,
  model_key text not null,
  display_name text not null,
  capabilities text[] not null,
  recovery_mode text not null check (recovery_mode in ('idempotency-key','client-reference-query','unsupported')),
  price_currency text not null,
  input_micros text not null,
  output_micros text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (provider_key, model_key)
);

alter table app.model_catalog enable row level security;
alter table app.model_catalog force row level security;

create table app.provider_route_audit (
  id bigserial primary key,
  provider_key text not null,
  route_token_hash text not null,
  matched boolean not null,
  called_by text not null default current_user,
  created_at timestamptz not null default now()
);

alter table app.provider_route_audit enable row level security;
alter table app.provider_route_audit force row level security;

create or replace function app.route_provider_webhook(providerKey text, routeToken text)
returns table(provider_config_id text, webhook_verification_secret_ref text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user <> 'comic_api' then
    raise exception 'PROVIDER_WEBHOOK_ROUTE_FORBIDDEN';
  end if;

  insert into app.provider_route_audit(provider_key, route_token_hash, matched)
  select providerKey, routeToken, exists (
    select 1
    from app.provider_configs pc
    where pc.provider_key = providerKey
      and pc.route_token_hash = routeToken
      and pc.enabled = true
  );

  if not exists (
    select 1
    from app.provider_configs pc
    where pc.provider_key = providerKey
      and pc.route_token_hash = routeToken
      and pc.enabled = true
  ) then
    raise exception 'PROVIDER_WEBHOOK_ROUTE_NOT_FOUND';
  end if;

  return query
  select pc.id, pc.webhook_verification_secret_ref
  from app.provider_configs pc
  where pc.provider_key = providerKey
    and pc.route_token_hash = routeToken
    and pc.enabled = true
  limit 1;
end;
$$;

alter function app.route_provider_webhook(text, text) owner to comic_security_owner;
revoke all on function app.route_provider_webhook(text, text) from public;
grant execute on function app.route_provider_webhook(text, text) to comic_api;

comment on function app.route_provider_webhook(text, text) is
  'Pre-signature webhook lookup returns only providerConfigId and webhook verification secret reference; never tenant, project scope or submit credentials.';
