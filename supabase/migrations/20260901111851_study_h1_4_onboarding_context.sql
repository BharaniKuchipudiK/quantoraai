create table if not exists public.study_onboarding_profiles (
  user_sub text primary key,
  study_context text null,
  curriculum text null,
  level_label text null,
  subjects text[] not null default '{}',
  goal text null,
  target_exam text null,
  exam_date date null,
  weekly_minutes integer null,
  preferred_modality text null,
  diagnostic_opt_in boolean not null default false,
  skipped boolean not null default false,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_onboarding_profiles_context_check check (study_context is null or study_context in ('school','university','professional','personal')),
  constraint study_onboarding_profiles_goal_check check (goal is null or goal in ('understand','exam','grades','assignment','revise','explore')),
  constraint study_onboarding_profiles_weekly_minutes_check check (weekly_minutes is null or weekly_minutes between 0 and 10080),
  constraint study_onboarding_profiles_modality_check check (preferred_modality is null or preferred_modality in ('balanced','visual','examples','concise','step_by_step')),
  constraint study_onboarding_profiles_subjects_check check (cardinality(subjects) <= 12)
);

comment on table public.study_onboarding_profiles is
  'Cold-start Study context only. Self-report is never verified mastery evidence.';

alter table public.study_onboarding_profiles enable row level security;
revoke all on public.study_onboarding_profiles from public, anon, authenticated;
grant select, insert, update on public.study_onboarding_profiles to service_role;

create index if not exists study_onboarding_profiles_updated_idx
  on public.study_onboarding_profiles (updated_at desc);
