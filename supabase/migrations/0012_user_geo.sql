-- Coarse geo from Vercel edge headers (country / region / city). No raw IP stored.

alter table public.users
  add column if not exists country_code text,
  add column if not exists region text,
  add column if not exists city text,
  add column if not exists geo_updated_at timestamptz;

alter table public.usage
  add column if not exists country_code text;

create index if not exists usage_country_idx on public.usage (country_code, created_at desc)
  where country_code is not null;

create or replace view public.product_geo_requests_7d as
select
  coalesce(country_code, 'unknown') as country_code,
  count(*)::bigint                    as requests
from public.usage
where created_at >= now() - interval '7 days'
group by 1
order by requests desc;

create or replace view public.product_geo_users_7d as
select
  coalesce(country_code, 'unknown') as country_code,
  count(distinct user_sub)::bigint  as active_users
from public.usage
where created_at >= now() - interval '7 days'
  and user_sub is not null
group by 1
order by active_users desc;

alter view public.product_geo_requests_7d set (security_invoker = on);
alter view public.product_geo_users_7d set (security_invoker = on);

revoke all on public.product_geo_requests_7d from anon, authenticated;
revoke all on public.product_geo_users_7d from anon, authenticated;
