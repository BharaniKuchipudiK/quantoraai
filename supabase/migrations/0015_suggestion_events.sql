-- Acceptance-Rate instrumentation (Roadmap 9.1).
--
-- The North-Star metric for the ProActive Communication Layer is NOT chat
-- frequency — it is whether a proactive suggestion/action is *accepted*. This
-- table records the lifecycle of every proactive act (shown / accepted /
-- dismissed) per surface. It stores no prompt or response text — only which
-- surface fired and what the user did — so it is operational telemetry, not
-- personal content (and is swept by the same retention TTL as usage).
--
-- Isolated new table: it does not alter product_events or any existing schema.

create table if not exists public.suggestion_events (
  id          bigserial primary key,
  user_sub    text references public.users(google_sub) on delete set null,
  surface     text not null,
  action      text not null check (action in ('shown', 'accepted', 'dismissed')),
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists suggestion_events_surface_action_time_idx
  on public.suggestion_events (surface, action, created_at desc);

-- Same lock-down as every other telemetry table: the anon/authenticated keys
-- (which ship to the browser) get nothing; only the service role reads/writes.
alter table public.suggestion_events enable row level security;
revoke all on public.suggestion_events from anon, authenticated;

-- Acceptance rate per surface over the last 7 days. accepted / (accepted +
-- dismissed) is the "did the user act on it" rate; shown is the exposure
-- denominator for an "ignored" view.
create or replace view public.suggestion_acceptance_7d as
select
  surface,
  count(*) filter (where action = 'shown')     as shown,
  count(*) filter (where action = 'accepted')  as accepted,
  count(*) filter (where action = 'dismissed') as dismissed,
  round(
    100.0 * count(*) filter (where action = 'accepted')
    / nullif(count(*) filter (where action in ('accepted', 'dismissed')), 0)
  , 1) as acceptance_rate_pct
from public.suggestion_events
where created_at >= now() - interval '7 days'
group by surface
order by shown desc;

alter view public.suggestion_acceptance_7d set (security_invoker = on);
revoke all on public.suggestion_acceptance_7d from anon, authenticated;
