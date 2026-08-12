-- Product context on usage rows + admin analytics views.
-- Extends the per-request usage ledger so the Control Tower can answer:
-- which models, modes, and domain focuses drive real engagement.

alter table public.usage
  add column if not exists studio_mode text
    check (studio_mode is null or studio_mode in ('ask', 'build', 'plan')),
  add column if not exists studio_domain text
    check (studio_domain is null or studio_domain in ('travel', 'education', 'finance', 'research')),
  add column if not exists choice_selected boolean not null default false;

create index if not exists usage_studio_mode_idx on public.usage (studio_mode, created_at desc)
  where studio_mode is not null;

create index if not exists usage_studio_domain_idx on public.usage (studio_domain, created_at desc)
  where studio_domain is not null;

-- Model popularity (7-day window, rolling via filter in queries)
create or replace view public.product_model_usage_7d as
select
  coalesce(model_id, 'unknown') as model_id,
  count(*)::bigint              as requests
from public.usage
where created_at >= now() - interval '7 days'
group by 1
order by requests desc;

create or replace view public.product_mode_usage_7d as
select
  coalesce(studio_mode, 'unknown') as studio_mode,
  count(*)::bigint                 as requests
from public.usage
where created_at >= now() - interval '7 days'
group by 1
order by requests desc;

create or replace view public.product_domain_usage_7d as
select
  coalesce(studio_domain, 'general') as studio_domain,
  count(*)::bigint                   as requests
from public.usage
where created_at >= now() - interval '7 days'
group by 1
order by requests desc;

create or replace view public.product_choice_engagement_7d as
select
  count(*) filter (where choice_selected)::bigint as choice_selections,
  count(*)::bigint                                as total_requests
from public.usage
where created_at >= now() - interval '7 days';
