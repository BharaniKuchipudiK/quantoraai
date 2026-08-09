-- Quantora: who uses this, and what it costs.
--
-- Sessions are self-contained signed cookies, so until now the server had no
-- record that anyone had ever signed up. That is fine for authentication and
-- useless for everything else: no signup count, no retention, no way to ban an
-- individual, and no idea what a user costs in API spend.
--
-- Two tables only. No billing schema — revenue is deferred until there is a
-- user base, and building a subscription seam for it now would be architecture
-- written against a guess.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
-- Keyed on Google's `sub`, not email. `sub` is the stable identifier for an
-- account; an email address can change, and keying on it would silently split
-- one person into two rows the day they change it.
create table if not exists public.users (
  google_sub    text primary key,
  email         text not null,
  name          text,
  picture       text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  sign_in_count integer not null default 1,
  -- Set to block someone without deleting their history. Checked at sign-in.
  blocked_at    timestamptz,
  blocked_reason text
);

create index if not exists users_created_idx on public.users (created_at desc);
create index if not exists users_last_seen_idx on public.users (last_seen_at desc);

-- ---------------------------------------------------------------------------
-- usage
-- ---------------------------------------------------------------------------
-- One row per AI request. user_sub is nullable on purpose: bring-your-own-key
-- callers may be signed out, and those requests cost this deployment nothing.
-- Recording them anyway keeps the volume picture honest.
create table if not exists public.usage (
  id            bigserial primary key,
  user_sub      text references public.users(google_sub) on delete set null,
  provider      text,
  model_id      text,
  latency_ms    integer,
  tokens_est    integer,
  -- Whether this request spent the deployment's own key. The column that
  -- answers "what is this actually costing me".
  used_server_key boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists usage_created_idx on public.usage (created_at desc);
create index if not exists usage_user_idx on public.usage (user_sub, created_at desc);
create index if not exists usage_cost_idx on public.usage (used_server_key, created_at desc)
  where used_server_key;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Enabled with NO policies, deliberately.
--
-- With RLS on and no policy granting access, the anon key — which ships to
-- every browser and is public by design — can read and write nothing here. The
-- service-role key bypasses RLS and is the only way in, which is why it must
-- live server-side only and must never carry a VITE_ prefix.
--
-- Fail-closed by construction: a future policy has to be added deliberately
-- rather than access being open until someone remembers to restrict it.
alter table public.users enable row level security;
alter table public.usage enable row level security;

-- ---------------------------------------------------------------------------
-- Signup and activity, computed rather than guessed.
-- Replaces the Math.random() values currently shown on the admin dashboard.
-- ---------------------------------------------------------------------------
create or replace view public.growth_daily as
select
  date_trunc('day', created_at) as day,
  count(*)                      as signups
from public.users
group by 1
order by 1 desc;

create or replace view public.usage_daily as
select
  date_trunc('day', created_at)                      as day,
  count(*)                                            as requests,
  count(distinct user_sub)                            as active_users,
  count(*) filter (where used_server_key)             as billable_requests,
  coalesce(sum(tokens_est), 0)                        as tokens_est,
  coalesce(round(avg(latency_ms)), 0)                 as avg_latency_ms
from public.usage
group by 1
order by 1 desc;
