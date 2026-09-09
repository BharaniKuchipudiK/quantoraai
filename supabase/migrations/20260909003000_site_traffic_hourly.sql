-- Privacy-safe website traffic counters for the executive analytics dashboard.
--
-- We intentionally do NOT store IP addresses, cookies, user ids, referrers, or
-- browser fingerprints. A signed-out app load increments one hourly aggregate
-- bucket. This answers "how often did people reach Quantora without already
-- being signed in?" without pretending we can identify unique visitors.

create table if not exists public.site_traffic_hourly (
  bucket_hour     timestamptz primary key,
  signed_out_hits bigint not null default 0 check (signed_out_hits >= 0),
  updated_at      timestamptz not null default now()
);

alter table public.site_traffic_hourly enable row level security;
revoke all on public.site_traffic_hourly from anon, authenticated;

create or replace function public.record_signed_out_hit()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_bucket timestamptz := date_trunc('hour', now());
begin
  insert into public.site_traffic_hourly (bucket_hour, signed_out_hits, updated_at)
  values (current_bucket, 1, now())
  on conflict (bucket_hour) do update
    set signed_out_hits = public.site_traffic_hourly.signed_out_hits + 1,
        updated_at = now();

  -- Aggregate telemetry needs no long-lived event history. Keep 90 days of
  -- hourly buckets and prune opportunistically whenever a new hit arrives.
  delete from public.site_traffic_hourly
  where bucket_hour < date_trunc('hour', now()) - interval '90 days';
end;
$$;

revoke all on function public.record_signed_out_hit() from public, anon, authenticated;
grant execute on function public.record_signed_out_hit() to service_role;

create or replace view public.website_traffic_summary as
select
  coalesce(sum(signed_out_hits) filter (
    where bucket_hour >= date_trunc('hour', now()) - interval '23 hours'
  ), 0)::bigint as signed_out_hits_24h,
  coalesce(sum(signed_out_hits) filter (
    where bucket_hour >= date_trunc('hour', now()) - interval '7 days'
  ), 0)::bigint as signed_out_hits_7d,
  coalesce(sum(signed_out_hits) filter (
    where bucket_hour >= date_trunc('hour', now()) - interval '14 days'
  ), 0)::bigint as signed_out_hits_14d
from public.site_traffic_hourly;

create or replace view public.website_traffic_daily_14d as
with days as (
  select generate_series(
    current_date - interval '13 days',
    current_date,
    interval '1 day'
  )::date as day
), daily as (
  select
    bucket_hour::date as day,
    sum(signed_out_hits)::bigint as hits
  from public.site_traffic_hourly
  where bucket_hour >= current_date - interval '13 days'
  group by 1
)
select
  days.day,
  coalesce(daily.hits, 0)::bigint as hits
from days
left join daily using (day)
order by days.day desc;

alter view public.website_traffic_summary set (security_invoker = on);
alter view public.website_traffic_daily_14d set (security_invoker = on);

revoke all on public.website_traffic_summary from anon, authenticated;
revoke all on public.website_traffic_daily_14d from anon, authenticated;
