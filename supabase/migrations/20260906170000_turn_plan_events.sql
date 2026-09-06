-- One row per turn plan (Phase 7). The planner now decides the lane of every
-- turn; nothing measured how often it answered, how often it agreed with the
-- rules it replaced, or how long it took. A decision that is not measured
-- cannot be promoted or demoted on evidence (Phase 6's lesson, again).
--
-- Operational data only: lanes, a source, a confidence, a duration, a short
-- error class. No prompt, no reply, no attachment name, no user id.

create table if not exists public.turn_plan_events (
  id                 bigserial primary key,
  lane               text not null check (lane in ('build', 'office', 'advisor', 'chat')),
  desk               text,
  office_kind        text,
  source             text not null check (source in ('planner', 'fallback')),
  agreed             boolean not null default false,
  confidence         numeric(4,3),
  deterministic_lane text not null check (deterministic_lane in ('build', 'office', 'advisor', 'chat')),
  planner_ms         integer,
  planner_error      text,
  pinned_desk        text,
  created_at         timestamptz not null default now()
);

create index if not exists turn_plan_events_created_idx
  on public.turn_plan_events (created_at desc);

alter table public.turn_plan_events enable row level security;
revoke all on public.turn_plan_events from anon, authenticated;
