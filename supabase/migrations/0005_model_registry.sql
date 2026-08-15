-- Persistent discovery history for Quantora's AI model dashboard.
-- Provider catalogues are treated as discovery signals, not permission to
-- route user traffic. `approved` remains false until Quantora's qualification
-- policy (or an operator) promotes the model.

create table if not exists public.model_registry (
  id                    text primary key,
  name                  text not null,
  provider              text not null,
  description           text,
  context_length        bigint,
  pricing               jsonb not null default '{}'::jsonb,
  is_free               boolean not null default false,
  approved              boolean not null default false,
  lifecycle             text not null default 'discovered'
                          check (lifecycle in ('discovered', 'testing', 'available', 'degraded', 'offline', 'retired', 'rejected')),
  health_status         text not null default 'listed'
                          check (health_status in ('listed', 'healthy', 'degraded', 'offline', 'unlisted', 'untested')),
  metadata_fingerprint  text not null,
  last_event            text not null default 'discovered',
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  last_changed_at       timestamptz not null default now(),
  removed_at            timestamptz,
  provider_created_at   timestamptz
);

create index if not exists model_registry_lifecycle_idx on public.model_registry (lifecycle, last_changed_at desc);
create index if not exists model_registry_free_idx on public.model_registry (is_free, last_seen_at desc) where is_free;

create table if not exists public.model_events (
  id          bigserial primary key,
  model_id    text not null,
  event_type  text not null check (event_type in ('discovered', 'updated', 'retired', 'restored', 'approved', 'rejected')),
  details     jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now()
);

create index if not exists model_events_model_idx on public.model_events (model_id, detected_at desc);
create index if not exists model_events_time_idx on public.model_events (detected_at desc);

alter table public.model_registry enable row level security;
alter table public.model_events enable row level security;

revoke all on public.model_registry from anon, authenticated;
revoke all on public.model_events from anon, authenticated;
