-- Privacy-safe signals for ranking models by real reliability and usefulness.
-- Deliberately stores no user id, prompt, response, IP address, or API key.

create table if not exists public.model_quality_events (
  id             bigserial primary key,
  request_id     uuid not null,
  model_id       text not null,
  task_category  text not null check (task_category in ('coding', 'vision', 'research', 'writing', 'quick', 'general')),
  outcome        text not null check (outcome in ('success', 'failure', 'helpful', 'not_helpful')),
  latency_ms     integer,
  fallback_from  text,
  created_at     timestamptz not null default now()
);

create index if not exists model_quality_model_idx
  on public.model_quality_events (model_id, task_category, created_at desc);
create index if not exists model_quality_request_idx
  on public.model_quality_events (request_id);
create unique index if not exists model_quality_one_feedback_idx
  on public.model_quality_events (request_id)
  where outcome in ('helpful', 'not_helpful');

alter table public.model_quality_events enable row level security;
revoke all on public.model_quality_events from anon, authenticated;

create or replace view public.model_quality_summary as
select
  model_id,
  task_category,
  count(*) filter (where outcome = 'success') as successful_responses,
  count(*) filter (where outcome = 'failure') as failed_responses,
  count(*) filter (where outcome = 'helpful') as helpful_votes,
  count(*) filter (where outcome = 'not_helpful') as not_helpful_votes,
  count(*) filter (where fallback_from is not null) as fallback_rescues,
  coalesce(round(avg(latency_ms) filter (where outcome = 'success')), 0) as avg_latency_ms
from public.model_quality_events
group by model_id, task_category;

revoke all on public.model_quality_summary from anon, authenticated;
