-- Shared provider circuit breaker state.
--
-- Module-scope Maps are not high availability on Vercel: every cold start and
-- concurrent function can see a different failure count. Provider health must
-- be shared across instances so a broken upstream is stopped once, not retried
-- independently by every function.

create table if not exists public.provider_circuits (
  circuit_key       text primary key,
  failures          integer not null default 0,
  opened_until      timestamptz,
  last_failure_at   timestamptz,
  last_success_at   timestamptz,
  updated_at        timestamptz not null default now()
);

alter table public.provider_circuits enable row level security;

create or replace function public.provider_circuit_failure(
  p_key text,
  p_failure_threshold integer,
  p_reset_ms integer
)
returns table (
  failures integer,
  opened_until timestamptz,
  last_failure_at timestamptz,
  last_success_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  insert into public.provider_circuits as pc (
    circuit_key, failures, opened_until, last_failure_at, updated_at
  ) values (
    p_key,
    1,
    case when 1 >= greatest(1, p_failure_threshold)
      then v_now + make_interval(secs => greatest(1, p_reset_ms)::numeric / 1000)
      else null end,
    v_now,
    v_now
  )
  on conflict (circuit_key) do update set
    failures = pc.failures + 1,
    opened_until = case
      when pc.failures + 1 >= greatest(1, p_failure_threshold)
        then v_now + make_interval(secs => greatest(1, p_reset_ms)::numeric / 1000)
      else null
    end,
    last_failure_at = v_now,
    updated_at = v_now;

  return query
  select pc.failures, pc.opened_until, pc.last_failure_at, pc.last_success_at
  from public.provider_circuits pc
  where pc.circuit_key = p_key;
end;
$$;

create or replace function public.provider_circuit_success(p_key text)
returns table (
  failures integer,
  opened_until timestamptz,
  last_failure_at timestamptz,
  last_success_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  insert into public.provider_circuits as pc (
    circuit_key, failures, opened_until, last_failure_at, last_success_at, updated_at
  ) values (p_key, 0, null, null, v_now, v_now)
  on conflict (circuit_key) do update set
    failures = 0,
    opened_until = null,
    last_failure_at = null,
    last_success_at = v_now,
    updated_at = v_now;

  return query
  select pc.failures, pc.opened_until, pc.last_failure_at, pc.last_success_at
  from public.provider_circuits pc
  where pc.circuit_key = p_key;
end;
$$;

revoke all on table public.provider_circuits from public, anon, authenticated;
revoke all on function public.provider_circuit_failure(text, integer, integer) from public, anon, authenticated;
revoke all on function public.provider_circuit_success(text) from public, anon, authenticated;
