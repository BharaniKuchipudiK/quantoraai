-- Watched research questions: one row per (user, question). The daily sweep
-- re-checks due rows against live sources and flags deterministic evidence
-- changes; the flag stays until the person acknowledges it.
create table if not exists research_watches (
  id uuid primary key default gen_random_uuid(),
  user_sub text not null,
  question text not null,
  evidence_digest text not null default '',
  evidence_hosts text[] not null default '{}',
  finding_count integer not null default 0,
  changed boolean not null default false,
  change_note text not null default '',
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_sub, question)
);

-- Service-role access only, like the users table: RLS on, no policies.
alter table research_watches enable row level security;

create index if not exists research_watches_user_idx on research_watches (user_sub);
create index if not exists research_watches_due_idx on research_watches (last_checked_at);
