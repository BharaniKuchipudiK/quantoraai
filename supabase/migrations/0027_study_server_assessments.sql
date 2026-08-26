-- Server-owned Study assessment attempts.
-- Correct answers and single-use state never leave the service-role boundary.

create table if not exists public.study_assessment_attempts (
  id uuid primary key,
  user_sub text not null references public.users(google_sub) on delete cascade,
  session_id text not null check (
    char_length(session_id) between 1 and 128
    and session_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  concept_id uuid not null references public.study_concepts(id) on delete restrict,
  item_key text not null check (
    char_length(item_key) between 1 and 160
    and item_key ~ '^[a-z0-9][a-z0-9._:-]*$'
  ),
  item_version text not null check (char_length(item_version) between 1 and 80),
  option_ids text[] not null check (cardinality(option_ids) between 2 and 8),
  correct_option_id text not null check (char_length(correct_option_id) between 1 and 40),
  misconception_option_ids text[] not null default '{}'::text[],
  difficulty double precision not null check (difficulty between 0 and 1),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  submitted_option_id text check (submitted_option_id is null or char_length(submitted_option_id) <= 40),
  correct boolean,
  score double precision check (score is null or score between 0 and 1),
  check (correct_option_id = any(option_ids)),
  check (submitted_option_id is null or submitted_option_id = any(option_ids)),
  check (expires_at > issued_at),
  check (
    (submitted_at is null and submitted_option_id is null and correct is null and score is null)
    or
    (submitted_at is not null and submitted_option_id is not null and correct is not null and score is not null)
  )
);

create index if not exists study_assessment_attempts_owner_time_idx
  on public.study_assessment_attempts (user_sub, issued_at desc);
create index if not exists study_assessment_attempts_expiry_idx
  on public.study_assessment_attempts (expires_at)
  where submitted_at is null;

alter table public.study_assessment_attempts enable row level security;
revoke all on public.study_assessment_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.study_assessment_attempts to service_role;

create or replace function public.complete_study_assessment_attempt(
  p_user_sub text,
  p_attempt_id uuid,
  p_option_id text,
  p_observed_at timestamptz
)
returns table (
  result_status text,
  result_correct boolean,
  result_score double precision,
  result_concept_id uuid,
  result_item_key text,
  result_item_version text,
  result_misconception boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.study_assessment_attempts%rowtype;
  v_correct boolean;
  v_misconception boolean;
begin
  select * into v_attempt
  from public.study_assessment_attempts
  where id = p_attempt_id and user_sub = p_user_sub
  for update;

  if not found then
    return query select 'not_found'::text, null::boolean, null::double precision,
      null::uuid, null::text, null::text, null::boolean;
    return;
  end if;

  if v_attempt.submitted_at is not null then
    return query select 'already_submitted'::text, v_attempt.correct, v_attempt.score,
      v_attempt.concept_id, v_attempt.item_key, v_attempt.item_version,
      coalesce(v_attempt.submitted_option_id = any(v_attempt.misconception_option_ids), false);
    return;
  end if;

  if v_attempt.expires_at <= now() then
    return query select 'expired'::text, null::boolean, null::double precision,
      v_attempt.concept_id, v_attempt.item_key, v_attempt.item_version, null::boolean;
    return;
  end if;

  if p_option_id is null or not (p_option_id = any(v_attempt.option_ids)) then
    return query select 'invalid_option'::text, null::boolean, null::double precision,
      v_attempt.concept_id, v_attempt.item_key, v_attempt.item_version, null::boolean;
    return;
  end if;

  v_correct := p_option_id = v_attempt.correct_option_id;
  v_misconception := not v_correct and p_option_id = any(v_attempt.misconception_option_ids);

  update public.study_assessment_attempts set
    submitted_at = p_observed_at,
    submitted_option_id = p_option_id,
    correct = v_correct,
    score = case when v_correct then 1.0 else 0.0 end
  where id = v_attempt.id;

  insert into public.study_mastery_events (
    event_key, user_sub, concept_id, event_kind, correct, score, difficulty,
    hints_used, independent, misconception_signal, provenance, source_ref,
    assessment_ref, item_ref, observed_at
  ) values (
    'study.assessment.' || v_attempt.id::text,
    p_user_sub,
    v_attempt.concept_id,
    'assessment_item',
    v_correct,
    case when v_correct then 1.0 else 0.0 end,
    v_attempt.difficulty,
    0,
    true,
    v_misconception,
    'quantora_authored',
    'quantora:study-assessment-bank',
    'attempt:' || v_attempt.id::text,
    v_attempt.item_key || '@' || v_attempt.item_version,
    p_observed_at
  ) on conflict (user_sub, event_key) do nothing;

  return query select 'graded'::text, v_correct,
    case when v_correct then 1.0 else 0.0 end,
    v_attempt.concept_id, v_attempt.item_key, v_attempt.item_version, v_misconception;
end;
$$;

revoke all on function public.complete_study_assessment_attempt(text, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_study_assessment_attempt(text, uuid, text, timestamptz)
  to service_role;
