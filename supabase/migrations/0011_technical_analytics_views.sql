-- Technical reliability & cost views for the admin Technical tab.
-- All read via service-role only (same pattern as product views).

create or replace view public.technical_key_mix_7d as
select
  count(*) filter (where used_server_key)::bigint  as server_key_requests,
  count(*) filter (where not used_server_key)::bigint as byok_requests,
  count(*)::bigint                                   as total_requests,
  coalesce(sum(tokens_est) filter (where used_server_key), 0)::bigint as server_key_tokens_est
from public.usage
where created_at >= now() - interval '7 days';

create or replace view public.technical_latency_summary_7d as
select
  count(*)::bigint as requests,
  coalesce(round(avg(latency_ms)), 0)::int as avg_latency_ms,
  coalesce(
    round(percentile_cont(0.95) within group (order by latency_ms)),
    0
  )::int as p95_latency_ms
from public.usage
where created_at >= now() - interval '7 days'
  and latency_ms is not null;

create or replace view public.technical_model_latency_7d as
select
  coalesce(model_id, 'unknown') as model_id,
  count(*)::bigint              as requests,
  coalesce(round(avg(latency_ms)), 0)::int as avg_latency_ms,
  coalesce(
    round(percentile_cont(0.95) within group (order by latency_ms)),
    0
  )::int as p95_latency_ms
from public.usage
where created_at >= now() - interval '7 days'
  and latency_ms is not null
group by 1
having count(*) >= 3
order by requests desc
limit 12;

create or replace view public.product_completion_7d as
select
  count(*) filter (where event_type = 'preview_opened')::bigint    as previews_opened,
  count(*) filter (where event_type = 'publish_completed')::bigint as publishes_completed,
  count(distinct user_sub) filter (where event_type = 'preview_opened')::bigint    as users_with_preview,
  count(distinct user_sub) filter (where event_type = 'publish_completed')::bigint as users_with_publish
from public.product_events
where created_at >= now() - interval '7 days';

alter view public.technical_key_mix_7d set (security_invoker = on);
alter view public.technical_latency_summary_7d set (security_invoker = on);
alter view public.technical_model_latency_7d set (security_invoker = on);
alter view public.product_completion_7d set (security_invoker = on);

revoke all on public.technical_key_mix_7d from anon, authenticated;
revoke all on public.technical_latency_summary_7d from anon, authenticated;
revoke all on public.technical_model_latency_7d from anon, authenticated;
revoke all on public.product_completion_7d from anon, authenticated;
