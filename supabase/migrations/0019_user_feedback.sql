-- Lightweight authenticated product feedback. Text is intentionally bounded
-- and kept separate from chat/project memory so feedback never becomes model context.
create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_sub text not null references public.users(google_sub) on delete cascade,
  feedback_type text not null check (feedback_type in ('feedback', 'suggestion')),
  message text not null check (char_length(message) between 1 and 500),
  page_path text check (page_path is null or char_length(page_path) <= 240),
  surface text check (surface is null or char_length(surface) <= 80),
  status text not null default 'new' check (status in ('new', 'reviewed', 'planned', 'done', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists user_feedback_created_idx
  on public.user_feedback (created_at desc);
create index if not exists user_feedback_user_created_idx
  on public.user_feedback (user_sub, created_at desc);

alter table public.user_feedback enable row level security;
revoke all on public.user_feedback from anon, authenticated;
-- Server writes only through the service-role REST client.
