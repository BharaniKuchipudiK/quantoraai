-- Study V7 — authoritative retention / transfer evidence semantics.
--
-- The browser and language model still cannot write verified learner evidence.
-- A reviewed, server-owned assessment attempt records the evidence purpose at
-- issuance time; the atomic grading RPC is the only path that turns that
-- purpose into a learner-ledger event.

alter table public.study_assessment_attempts
  add column if not exists evidence_kind text not null default 'assessment_item';

alter table public.study_assessment_attempts
  add column if not exists evidence_concept_id uuid references public.study_concepts(id) on delete restrict;

alter table public.study_assessment_attempts
  add column if not exists retention_anchor_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'study_assessment_attempts_evidence_kind_check'
  ) then
    alter table public.study_assessment_attempts
      add constraint study_assessment_attempts_evidence_kind_check
      check (evidence_kind in (
        'assessment_item', 'retrieval', 'application', 'transfer',
        'retention_probe', 'misconception_probe'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'study_assessment_attempts_retention_anchor_check'
  ) then
    alter table public.study_assessment_attempts
      add constraint study_assessment_attempts_retention_anchor_check
      check (
        (evidence_kind = 'retention_probe' and retention_anchor_at is not null)
        or
        (evidence_kind <> 'retention_probe' and retention_anchor_at is null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'study_assessment_attempts_transfer_concept_check'
  ) then
    alter table public.study_assessment_attempts
      add constraint study_assessment_attempts_transfer_concept_check
      check (
        (evidence_kind = 'transfer' and evidence_concept_id is not null and evidence_concept_id <> concept_id)
        or
        (evidence_kind <> 'transfer' and evidence_concept_id is null)
      );
  end if;
end $$;

create index if not exists study_assessment_attempts_evidence_concept_time_idx
  on public.study_assessment_attempts (user_sub, evidence_concept_id, submitted_at desc)
  where evidence_concept_id is not null;

-- Candidate-scoped freshness reads must stay O(log n) as learner history grows.
create index if not exists study_assessment_attempts_owner_item_submitted_idx
  on public.study_assessment_attempts (user_sub, item_key, item_version)
  where submitted_at is not null;

-- The return shape changes in V7, so PostgreSQL requires a drop/recreate rather
-- than CREATE OR REPLACE. The migration runs transactionally.
drop function if exists public.complete_study_assessment_attempt(text, uuid, text, timestamptz);

create function public.complete_study_assessment_attempt(
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
  result_misconception boolean,
  result_evidence_kind text,
  result_evidence_concept_id uuid,
  result_delay_days integer
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
  v_event_concept_id uuid;
  v_delay_days integer;
begin
  select * into v_attempt
  from public.study_assessment_attempts
  where id = p_attempt_id and user_sub = p_user_sub
  for update;

  if not found then
    return query select 'not_found'::text, null::boolean, null::double precision,
      null::uuid, null::text, null::text, null::boolean,
      null::text, null::uuid, null::integer;
    return;
  end if;

  v_event_concept_id := coalesce(v_attempt.evidence_concept_id, v_attempt.concept_id);

  if v_attempt.submitted_at is not null then
    v_delay_days := case
      when v_attempt.evidence_kind = 'retention_probe' and v_attempt.retention_anchor_at is not null
        then greatest(0, floor(extract(epoch from (v_attempt.submitted_at - v_attempt.retention_anchor_at)) / 86400.0)::integer)
      else null
    end;
    return query select 'already_submitted'::text, v_attempt.correct, v_attempt.score,
      v_attempt.concept_id, v_attempt.item_key, v_attempt.item_version,
      case
        when v_attempt.evidence_kind in ('assessment_item', 'retrieval', 'application', 'misconception_probe')
          then coalesce(v_attempt.submitted_option_id = any(v_attempt.misconception_option_ids), false)
        else false
      end,
      v_attempt.evidence_kind, v_event_concept_id, v_delay_days;
    return;
  end if;

  if v_attempt.expires_at <= now() then
    return query select 'expired'::text, null::boolean, null::double precision,
      v_attempt.concept_id, v_attempt.item_key, v_attempt.item_version, null::boolean,
      v_attempt.evidence_kind, v_event_concept_id, null::integer;
    return;
  end if;

  if p_option_id is null or not (p_option_id = any(v_attempt.option_ids)) then
    return query select 'invalid_option'::text, null::boolean, null::double precision,
      v_attempt.concept_id, v_attempt.item_key, v_attempt.item_version, null::boolean,
      v_attempt.evidence_kind, v_event_concept_id, null::integer;
    return;
  end if;

  v_correct := p_option_id = v_attempt.correct_option_id;
  v_misconception := not v_correct
    and v_attempt.evidence_kind in ('assessment_item', 'retrieval', 'application', 'misconception_probe')
    and p_option_id = any(v_attempt.misconception_option_ids);

  v_delay_days := case
    when v_attempt.evidence_kind = 'retention_probe' and v_attempt.retention_anchor_at is not null
      then greatest(0, floor(extract(epoch from (p_observed_at - v_attempt.retention_anchor_at)) / 86400.0)::integer)
    else null
  end;

  -- One reviewed item/version may contribute independent evidence only once for
  -- this learner, even if a later caller tries to relabel it as another evidence
  -- kind or point it at another concept.
  perform pg_advisory_xact_lock(hashtextextended(
    p_user_sub || ':' || v_attempt.item_key || '@' || v_attempt.item_version,
    0
  ));
  select not exists (
    select 1 from public.study_mastery_events
    where user_sub = p_user_sub
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
    hints_used, independent, misconception_signal, delay_days, provenance,
    source_ref, assessment_ref, item_ref, observed_at
  ) values (
    'study.assessment.' || v_attempt.id::text,
    p_user_sub,
    v_event_concept_id,
    v_attempt.evidence_kind,
    v_correct,
    case when v_correct then 1.0 else 0.0 end,
    v_attempt.difficulty,
    0,
    v_independent,
    v_misconception,
    v_delay_days,
    'quantora_authored',
    'quantora:study-assessment-bank',
    'attempt:' || v_attempt.id::text,
    v_attempt.item_key || '@' || v_attempt.item_version,
    p_observed_at
  ) on conflict (user_sub, event_key) do nothing;

  return query select 'graded'::text, v_correct,
    (case when v_correct then 1.0 else 0.0 end)::double precision,
    v_attempt.concept_id, v_attempt.item_key, v_attempt.item_version, v_misconception,
    v_attempt.evidence_kind, v_event_concept_id, v_delay_days;
end;
$$;

revoke all on function public.complete_study_assessment_attempt(text, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_study_assessment_attempt(text, uuid, text, timestamptz)
  to service_role;
