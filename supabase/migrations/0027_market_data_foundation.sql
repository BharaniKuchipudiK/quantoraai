-- Market-data foundation for the Finance Advisor (ADR-025, P0).
--
-- These tables are the fact base the Finance workspace grounds its advice on:
-- prices, FX, and fundamentals arrive from an out-of-band ingestion job (a
-- scheduled GitHub Action in the $0 phase, Cloud Run when funded) and are read
-- back on the hot path through `api/_lib/market-data-store.ts`. The two sides
-- never call each other — Supabase is the only contract between them.
--
-- Trust rule, enforced by schema: every fact-bearing row carries `source`
-- (which provider it came from) and `as_of` (the datum's own effective time,
-- e.g. the market close), plus `ingested_at`. Nothing here is ever presented as
-- current without an as-of the analyst can cite; a stale row is refused at read
-- time, never silently treated as live.
--
-- Benchmarks are modelled as instruments with asset_type = 'index' whose levels
-- live in market_prices, rather than a near-duplicate table — one shape for
-- "a thing with a daily value", no drift between two copies.
--
-- Like model_registry, these tables are server-only: RLS on, all grants revoked
-- from anon/authenticated. The service-role key (server-side) bypasses RLS to
-- read and write; browser clients can never touch raw market data directly.

-- Reference universe: what an instrument IS. --------------------------------
create table if not exists public.market_instruments (
  instrument_id   text primary key,                       -- stable id, e.g. 'AAPL.US', 'SPX.INDX'
  symbol          text not null,
  name            text,
  asset_type      text not null default 'equity'
                    check (asset_type in ('equity', 'etf', 'index', 'fund', 'bond', 'crypto', 'commodity', 'fx')),
  currency        text,                                    -- ISO 4217, when known
  exchange        text,
  mic             text,                                    -- ISO 10383 market identifier code
  sector          text,
  source          text not null,
  as_of           timestamptz,
  status          text not null default 'active'
                    check (status in ('active', 'delisted', 'unknown')),
  first_seen_at   timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists market_instruments_symbol_idx
  on public.market_instruments (symbol);
create index if not exists market_instruments_type_idx
  on public.market_instruments (asset_type, status);

-- End-of-day price bars (also holds index levels via close). ------------------
create table if not exists public.market_prices (
  instrument_id   text not null references public.market_instruments (instrument_id) on delete cascade,
  price_date      date not null,
  open            numeric,
  high            numeric,
  low             numeric,
  close           numeric,
  adj_close       numeric,
  volume          bigint,
  currency        text,
  source          text not null,
  as_of           timestamptz not null,
  ingested_at     timestamptz not null default now(),
  primary key (instrument_id, price_date)
);

create index if not exists market_prices_latest_idx
  on public.market_prices (instrument_id, price_date desc);

-- FX rates, base→quote on a date. --------------------------------------------
create table if not exists public.fx_rates (
  base_currency   text not null,
  quote_currency  text not null,
  rate_date       date not null,
  rate            numeric not null,
  source          text not null,
  as_of           timestamptz not null,
  ingested_at     timestamptz not null default now(),
  primary key (base_currency, quote_currency, rate_date)
);

create index if not exists fx_rates_latest_idx
  on public.fx_rates (base_currency, quote_currency, rate_date desc);

-- Fundamentals: metric bag per instrument as-of a date. jsonb keeps the schema
-- open across sources (SEC vs a vendor) without a migration per new field.
create table if not exists public.market_fundamentals (
  instrument_id   text not null references public.market_instruments (instrument_id) on delete cascade,
  as_of_date      date not null,
  metrics         jsonb not null default '{}'::jsonb,      -- e.g. { expense_ratio, pe, eps, dividend_yield }
  source          text not null,
  as_of           timestamptz not null,
  ingested_at     timestamptz not null default now(),
  primary key (instrument_id, as_of_date)
);

create index if not exists market_fundamentals_latest_idx
  on public.market_fundamentals (instrument_id, as_of_date desc);

-- Server-only, like model_registry. -----------------------------------------
alter table public.market_instruments   enable row level security;
alter table public.market_prices        enable row level security;
alter table public.fx_rates             enable row level security;
alter table public.market_fundamentals  enable row level security;

revoke all on public.market_instruments   from anon, authenticated;
revoke all on public.market_prices         from anon, authenticated;
revoke all on public.fx_rates              from anon, authenticated;
revoke all on public.market_fundamentals   from anon, authenticated;
