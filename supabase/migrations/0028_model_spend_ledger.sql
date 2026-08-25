-- Monthly paid-inference spend ledger.
--
-- Quantora had no cost accounting at all, so a monthly budget could only ever
-- have been a comment. This table is the record the ceiling is enforced
-- against; without it, "paid fallback with a $50 cap" is an unenforceable
-- promise.
--
-- Accumulation must be atomic for the same reason provider_circuits is shared:
-- module-scope state is not high availability on Vercel, and concurrent
-- functions each holding their own running total would lose spend and drift
-- under the real ceiling.

create table if not exists public.model_spend_ledger (
  month_key    text primary key,            -- UTC calendar month, 'YYYY-MM'
  spent_usd    numeric(14, 8) not null default 0,
  calls        integer not null default 0,
  updated_at   timestamptz not null default now()
);

alter table public.model_spend_ledger enable row level security;

-- Atomic accumulate-and-read. Returns the running total AFTER this call, so a
-- caller never has to re-read (and race) to learn where it now stands.
create or replace function public.record_model_spend(
  p_month_key text,
  p_cost_usd numeric
)
returns table (
  month_key text,
  spent_usd numeric,
  calls integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now  timestamptz := clock_timestamp();
  -- A negative cost must never credit the ledger back below what was spent.
  v_cost numeric := greatest(0, coalesce(p_cost_usd, 0));
begin
  insert into public.model_spend_ledger as sl (month_key, spent_usd, calls, updated_at)
  values (p_month_key, v_cost, 1, v_now)
  on conflict (month_key) do update set
    spent_usd = sl.spent_usd + v_cost,
    calls = sl.calls + 1,
    updated_at = v_now;

  return query
  select sl.month_key, sl.spent_usd, sl.calls
  from public.model_spend_ledger sl
  where sl.month_key = p_month_key;
end;
$$;

revoke all on table public.model_spend_ledger from public, anon, authenticated;
revoke all on function public.record_model_spend(text, numeric) from public, anon, authenticated;
