-- Repeated exposure to one released item must not become fresh mastery evidence.
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
security invoker
set search_path = public
as $$
declare
  v_attempt public.study_assessment_attempts%rowtype;
  v_correct boolean;
  v_misconception boolean;
  v_independent boolean;
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

  perform pg_advisory_xact_lock(hashtextextended(
    p_user_sub || ':' || v_attempt.concept_id::text || ':' ||
      v_attempt.item_key || '@' || v_attempt.item_version,
    0
  ));
  select not exists (
    select 1 from public.study_mastery_events
    where user_sub = p_user_sub
      and concept_id = v_attempt.concept_id
      and event_kind = 'assessment_item'
      and item_ref = v_attempt.item_key || '@' || v_attempt.item_version
      and independent = true
  ) into v_independent;

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
    v_independent,
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
