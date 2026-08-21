create or replace view public.model_quality_recent_summary
with (security_invoker = true)
as
select
  model_id,
  task_category,
  count(*) filter (where outcome = 'success') as successful_responses,
  count(*) filter (where outcome = 'failure') as failed_responses,
  count(*) filter (where outcome = 'helpful') as helpful_votes,
  count(*) filter (where outcome = 'not_helpful') as not_helpful_votes,
  count(*) filter (where fallback_from is not null) as fallback_rescues,
  coalesce(round(avg(latency_ms) filter (where outcome = 'success')), 0) as avg_latency_ms,
  max(created_at) as last_event_at
from public.model_quality_events
where created_at >= now() - interval '7 days'
group by model_id, task_category;

revoke all on public.model_quality_recent_summary from anon, authenticated;
grant select on public.model_quality_recent_summary to service_role;
