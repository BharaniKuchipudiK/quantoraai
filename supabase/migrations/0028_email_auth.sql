-- Email/password and multi-provider auth on users.
-- google_sub stays the primary key (Google sub, github:ID, email:UUID).
--
-- If the Supabase SQL editor times out, run EACH statement below separately
-- (one highlight → Run). A paused free-tier project must be woken first.

-- 1) Password column (safe, instant)
alter table public.users
  add column if not exists password_hash text;

-- 2) Provider column (nullable + default — avoids a heavy table rewrite)
alter table public.users
  add column if not exists auth_provider text default 'google';

update public.users
  set auth_provider = 'google'
  where auth_provider is null;

-- 3) Unique email index — run LAST, only after 1–2 succeed.
-- If this fails with "duplicate key", you have two rows with the same email
-- (different casing). Fix duplicates first, then re-run.
create unique index if not exists users_email_lower_unique
  on public.users (lower(email));
