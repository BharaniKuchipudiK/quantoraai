-- What happened under one reference id, kept past the life of the function
-- that logged it (2026-09-05: "This turn ended without a reply … Reference:
-- studio-…" resolved to nothing, because boundary events were stdout lines).
--
-- Operational data only: a boundary, a state, an engine, a status, a duration.
-- No prompt, no reply, no API key, no IP address. user_sub is the signed-in
-- owner so a person can read back their own reference and nobody else's.
-- Retention is not enforced here; rows are small and carry no content.

create table if not exists public.transaction_boundary_events (
  id                bigserial primary key,
  correlation_id    text not null,
  boundary          text not null,
  state             text not null,
  transaction       text,
  route             text,
  model_id          text,
  gateway           text,
  upstream_provider text,
  failure_domain    text,
  quota_domain      text,
  cost_class        text,
  health            text,
  circuit           text,
  duration_ms       integer,
  budget_ms         integer,
  status_code       integer,
  file_count        integer,
  detail_code       text,
  user_sub          text,
  created_at        timestamptz not null default now(),
  constraint transaction_boundary_events_correlation_shape
    check (correlation_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,95}$'),
  constraint transaction_boundary_events_boundary_shape
    check (boundary ~ '^[a-z][a-z0-9._-]{2,80}$'),
  constraint transaction_boundary_events_state_known
    check (state in ('started', 'selected', 'attempting', 'succeeded', 'failed', 'parsed', 'compiled', 'rendered', 'interacted', 'skipped'))
);

-- The lookup: every event of one reference, in the order it happened.
create index if not exists transaction_boundary_events_correlation_idx
  on public.transaction_boundary_events (correlation_id, created_at, id);
-- For any future retention job.
create index if not exists transaction_boundary_events_created_idx
  on public.transaction_boundary_events (created_at);

alter table public.transaction_boundary_events enable row level security;
revoke all on table public.transaction_boundary_events from public, anon, authenticated;
grant select, insert, delete on table public.transaction_boundary_events to service_role;
