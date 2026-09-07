create table if not exists public.study_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  user_sub text not null references public.users(google_sub) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 1 and 100),
  topic text check (topic is null or char_length(btrim(topic)) between 1 and 200),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null default 'study' check (kind in ('study', 'exam', 'deadline')),
  status text not null default 'planned' check (status in ('planned', 'completed', 'skipped')),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_schedule_blocks_time_order check (ends_at > starts_at),
  constraint study_schedule_blocks_duration_bound check (ends_at <= starts_at + interval '24 hours')
);

create index if not exists study_schedule_blocks_owner_start_idx
  on public.study_schedule_blocks (user_sub, starts_at, id);

create index if not exists study_schedule_blocks_owner_status_start_idx
  on public.study_schedule_blocks (user_sub, status, starts_at);

alter table public.study_schedule_blocks enable row level security;
revoke all on public.study_schedule_blocks from public, anon, authenticated;
grant select, insert, update, delete on public.study_schedule_blocks to service_role;

comment on table public.study_schedule_blocks is
  'Learner-owned Study planning blocks. Completion is planning behavior only and never verified mastery evidence.';
