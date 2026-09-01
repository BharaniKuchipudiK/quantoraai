-- Learner-owned Study notebook.
-- Personal notes are study material only and must never become verified mastery evidence.

create table if not exists public.study_notebook_notes (
  id uuid primary key default gen_random_uuid(),
  user_sub text not null references public.users(google_sub) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 1 and 100),
  topic text check (topic is null or char_length(btrim(topic)) between 1 and 200),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null default '' check (char_length(body) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_notebook_notes_owner_updated_idx
  on public.study_notebook_notes (user_sub, updated_at desc, id);

create index if not exists study_notebook_notes_owner_subject_idx
  on public.study_notebook_notes (user_sub, subject, updated_at desc);

alter table public.study_notebook_notes enable row level security;
revoke all on public.study_notebook_notes from public, anon, authenticated;
grant select, insert, update, delete on public.study_notebook_notes to service_role;

comment on table public.study_notebook_notes is
  'Learner-owned Study notes. Personal study material only; never admitted as verified mastery evidence.';
