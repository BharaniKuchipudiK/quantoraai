-- Account-level context that survives individual chats/projects. This is the
-- durable personal state used by Quantora's decision layer; it is intentionally
-- separate from session Outcome State and Project Context Graph.
create table if not exists public.user_context_nodes (
  id uuid primary key default gen_random_uuid(),
  user_sub text not null references public.users(google_sub) on delete cascade,
  category text not null check (category in (
    'fact', 'preference', 'goal', 'commitment', 'constraint', 'financial_state'
  )),
  context_key text not null check (
    char_length(context_key) between 1 and 160
    and context_key ~ '^[a-z0-9][a-z0-9._:-]*$'
  ),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  provenance text not null check (provenance in (
    'user', 'connected_source', 'tool', 'inferred', 'system'
  )),
  confidence double precision not null default 0.5 check (confidence between 0 and 1),
  status text not null default 'active' check (status in ('active', 'superseded')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 2000),
  valid_from timestamptz,
  valid_until timestamptz,
  supersedes uuid references public.user_context_nodes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create index if not exists user_context_owner_active_idx
  on public.user_context_nodes (user_sub, status, updated_at desc);
create index if not exists user_context_owner_key_idx
  on public.user_context_nodes (user_sub, context_key, status, updated_at desc);
create index if not exists user_context_owner_category_idx
  on public.user_context_nodes (user_sub, category, status, updated_at desc);

alter table public.user_context_nodes enable row level security;
revoke all on public.user_context_nodes from anon, authenticated;
-- Access is server-only through the authenticated session subject + service role.
-- No browser-provided user id is trusted as ownership.
