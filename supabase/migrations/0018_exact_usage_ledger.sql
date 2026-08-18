-- Exact AI usage ledger.
--
-- Existing callers can continue writing `tokens_est`; new provider-aware callers
-- can additionally record native token counts and provider-reported cost.
-- Old rows are preserved and explicitly marked estimated rather than being
-- rewritten as if they were exact.

alter table public.usage
  add column if not exists request_id text,
  add column if not exists parent_request_id text,
  add column if not exists project_id text,
  add column if not exists session_id text,
  add column if not exists operation text,
  add column if not exists provider_request_id text,
  add column if not exists token_source text not null default 'estimated'
    check (token_source in ('provider', 'estimated')),
  add column if not exists input_tokens bigint,
  add column if not exists output_tokens bigint,
  add column if not exists reasoning_tokens bigint,
  add column if not exists cached_tokens bigint,
  add column if not exists total_tokens bigint,
  add column if not exists cost_usd numeric(18, 9);

update public.usage
set total_tokens = tokens_est
where total_tokens is null and tokens_est is not null;

create unique index if not exists usage_request_id_unique_idx
  on public.usage (request_id)
  where request_id is not null;

create index if not exists usage_project_created_idx
  on public.usage (project_id, created_at desc)
  where project_id is not null;

create index if not exists usage_session_created_idx
  on public.usage (session_id, created_at desc)
  where session_id is not null;

create index if not exists usage_operation_created_idx
  on public.usage (operation, created_at desc)
  where operation is not null;

create or replace view public.usage_consumption_7d as
select
  count(*)::bigint as requests,
  count(*) filter (where token_source = 'provider')::bigint as exact_requests,
  count(*) filter (where token_source = 'estimated')::bigint as estimated_requests,
  coalesce(sum(input_tokens), 0)::bigint as input_tokens,
  coalesce(sum(output_tokens), 0)::bigint as output_tokens,
  coalesce(sum(reasoning_tokens), 0)::bigint as reasoning_tokens,
  coalesce(sum(cached_tokens), 0)::bigint as cached_tokens,
  coalesce(sum(total_tokens), 0)::bigint as total_tokens,
  coalesce(sum(cost_usd), 0)::numeric(18, 9) as provider_reported_cost_usd,
  coalesce(sum(cost_usd) filter (where used_server_key), 0)::numeric(18, 9) as quantora_funded_cost_usd
from public.usage
where created_at >= now() - interval '7 days';

create or replace view public.usage_model_consumption_7d as
select
  coalesce(provider, 'unknown') as provider,
  coalesce(model_id, 'unknown') as model_id,
  count(*)::bigint as requests,
  coalesce(sum(total_tokens), 0)::bigint as total_tokens,
  coalesce(sum(input_tokens), 0)::bigint as input_tokens,
  coalesce(sum(output_tokens), 0)::bigint as output_tokens,
  coalesce(sum(reasoning_tokens), 0)::bigint as reasoning_tokens,
  coalesce(sum(cached_tokens), 0)::bigint as cached_tokens,
  coalesce(sum(cost_usd), 0)::numeric(18, 9) as provider_reported_cost_usd
from public.usage
where created_at >= now() - interval '7 days'
group by provider, model_id
order by provider_reported_cost_usd desc, total_tokens desc;

alter view public.usage_consumption_7d set (security_invoker = on);
alter view public.usage_model_consumption_7d set (security_invoker = on);
revoke all on public.usage_consumption_7d from anon, authenticated;
revoke all on public.usage_model_consumption_7d from anon, authenticated;
