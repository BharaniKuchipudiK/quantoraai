-- Resource ownership for Vercel projects created through Quantora.
-- Domain changes must resolve through this table before the server uses its
-- privileged Vercel credential.

create table if not exists public.published_sites (
  project_name   text primary key,
  user_sub       text not null references public.users(google_sub) on delete cascade,
  deployment_id text not null,
  deployment_url text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists published_sites_owner_idx
  on public.published_sites (user_sub, updated_at desc);

alter table public.published_sites enable row level security;
revoke all on public.published_sites from anon, authenticated;
