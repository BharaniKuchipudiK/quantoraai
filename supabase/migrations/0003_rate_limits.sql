-- Durable rate limiting.
--
-- The existing limiter keeps counters in a module-scope Map. On Vercel that is
-- per-instance and per-cold-start: a burst spread across several concurrent
-- functions gets a fresh allowance in each one, and every cold start wipes the
-- record entirely. It raises the bar against casual abuse and provides no real
-- guarantee — which was documented at the time as a stopgap.
--
-- A single counter row per (key, window) in Postgres removes both problems: all
-- instances increment the same row, and it survives restarts.

create table if not exists public.rate_limits (
  bucket_key   text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket_key, window_start)
);

-- Old windows are dead weight; this index makes sweeping them cheap.
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;

-- Atomic increment-and-check.
--
-- Doing this as read-then-write from the application would race: two requests
-- arriving together both read the same count and both decide they are under the
-- limit. INSERT ... ON CONFLICT DO UPDATE performs the increment and returns
-- the new value in one statement, so the decision is made against a number that
-- cannot have moved underneath it.
create or replace function public.hit_rate_limit(
  p_key      text,
  p_limit    integer,
  p_window_s integer
)
returns table (allowed boolean, hits integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
begin
  -- Fixed windows, floored to the interval, so every instance agrees on which
  -- window a request belongs to without coordinating.
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);

  insert into public.rate_limits (bucket_key, window_start, hits)
  values (p_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set hits = public.rate_limits.hits + 1
  returning public.rate_limits.hits into v_hits;

  return query select (v_hits <= p_limit), v_hits, v_window_start + make_interval(secs => p_window_s);
end;
$$;

revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;

-- Housekeeping. Call periodically; nothing depends on it running promptly.
create or replace function public.sweep_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.sweep_rate_limits() from public, anon, authenticated;
