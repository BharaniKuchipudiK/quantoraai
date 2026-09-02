-- Per-user GitHub authorizations, replacing the shared platform token for writes.
--
-- One row per Quantora account. `sealed_token` is AES-256-GCM ciphertext produced
-- by api/_lib/github-principal.ts with GITHUB_CONNECTION_SECRET; the plaintext
-- token never reaches this database, and a dump of this table without that
-- server-held secret yields no usable GitHub credential.
--
-- RLS is on with no policies and both roles are revoked, matching every other
-- credential-adjacent table here: only the service role, server-side, may read it.

create table if not exists public.github_connections (
  user_sub      text primary key references public.users(google_sub) on delete cascade,
  github_login  text not null,
  sealed_token  text not null,
  scopes        jsonb not null default '[]'::jsonb,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.github_connections.sealed_token is
  'AES-256-GCM sealed GitHub OAuth token. Never store or log plaintext.';

create index if not exists github_connections_login_idx
  on public.github_connections (github_login);

alter table public.github_connections enable row level security;
revoke all on public.github_connections from anon, authenticated;
