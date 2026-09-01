-- Study V7 production canary.
--
-- This is intentionally rollback-only. It creates a synthetic learner and
-- synthetic assessment rows inside one transaction, proves the live V7
-- constraints/functions/trigger semantics, and then removes every write by
-- rolling the transaction back.
--
-- It is safe to run repeatedly against production through a privileged SQL
-- channel. Do not weaken the final rollback or use this as a data migration.
-- The transfer row uses an existing active governed graph edge. Product-level
-- transfer issuance remains additionally gated by reviewed application content
-- in the server resolver; this SQL proves the database evidence semantics only.

begin;

do $$
declare
  v_user text := 'study-v7-canary-' || replace(gen_random_uuid()::text, '-', '');
  v_source uuid;
  v_target uuid;
  v_now timestamptz := clock_timestamp();
  v_ordinary uuid := gen_random_uuid();
  v_active_dup uuid := gen_random_uuid();
  v_submitted_dup uuid := gen_random_uuid();
  v_retention uuid := gen_random_uuid();
  v_transfer uuid := gen_random_uuid();
  v_bad uuid := gen_random_uuid();
  v_result record;
  v_count integer;
  v_key text;
begin
  select e.source_concept_id, e.target_concept_id
    into v_source, v_target
  from public.study_concept_edges e
  join public.study_concepts s on s.id = e.source_concept_id
  join public.study_concepts t on t.id = e.target_concept_id
  where e.relation = 'supports_transfer_to'
    and e.confidence >= 0.8
    and s.status = 'active'
    and t.status = 'active'
  order by e.confidence desc, e.source_concept_id, e.target_concept_id
  limit 1;

  if v_source is null or v_target is null then
    raise exception 'study_v7_canary_no_governed_transfer_edge';
  end if;

  insert into public.users (google_sub, email, name)
  values (v_user, v_user || '@example.invalid', 'Study V7 Canary');

  -- Ordinary reviewed-assessment semantics plus active-attempt race guard.
  v_key := 'study-v7-canary-ordinary-' || right(v_ordinary::text, 12);
  insert into public.study_assessment_attempts (
    id, user_sub, session_id, concept_id, item_key, item_version,
    option_ids, correct_option_id, misconception_option_ids, difficulty,
    expires_at, evidence_kind, evidence_concept_id, retention_anchor_at
  ) values (
    v_ordinary, v_user, 'canary-session', v_source, v_key, '1',
    array['a','b'], 'a', array['b'], 0.5,
    v_now + interval '15 minutes', 'assessment_item', null, null
  );

  begin
    insert into public.study_assessment_attempts (
      id, user_sub, session_id, concept_id, item_key, item_version,
      option_ids, correct_option_id, misconception_option_ids, difficulty,
      expires_at, evidence_kind
    ) values (
      v_active_dup, v_user, 'canary-session-active-dup', v_source, v_key, '1',
      array['a','b'], 'a', array['b'], 0.5,
      v_now + interval '15 minutes', 'assessment_item'
    );
    raise exception 'study_v7_canary_expected_active_guard';
  exception when others then
    if sqlerrm <> 'study_assessment_item_already_active' then raise; end if;
  end;

  select * into v_result
  from public.complete_study_assessment_attempt(v_user, v_ordinary, 'a', v_now);
  if v_result.result_status <> 'graded'
    or v_result.result_correct is distinct from true
    or v_result.result_score is distinct from 1.0
    or v_result.result_concept_id is distinct from v_source
    or v_result.result_evidence_kind is distinct from 'assessment_item'
    or v_result.result_evidence_concept_id is distinct from v_source
    or v_result.result_delay_days is not null then
    raise exception 'study_v7_canary_ordinary_grade_contract';
  end if;

  select count(*) into v_count
  from public.study_mastery_events
  where user_sub = v_user
    and assessment_ref = 'attempt:' || v_ordinary::text
    and concept_id = v_source
    and event_kind = 'assessment_item'
    and independent = true;
  if v_count <> 1 then raise exception 'study_v7_canary_ordinary_event_contract'; end if;

  -- Replay must be idempotent and must not create a second ledger event.
  select * into v_result
  from public.complete_study_assessment_attempt(v_user, v_ordinary, 'a', v_now + interval '1 second');
  if v_result.result_status <> 'already_submitted' then
    raise exception 'study_v7_canary_replay_contract';
  end if;
  select count(*) into v_count
  from public.study_mastery_events
  where user_sub = v_user and assessment_ref = 'attempt:' || v_ordinary::text;
  if v_count <> 1 then raise exception 'study_v7_canary_replay_duplicate_event'; end if;

  -- Learner-global item/version freshness is independent of concept labels.
  begin
    insert into public.study_assessment_attempts (
      id, user_sub, session_id, concept_id, item_key, item_version,
      option_ids, correct_option_id, misconception_option_ids, difficulty,
      expires_at, evidence_kind
    ) values (
      v_submitted_dup, v_user, 'canary-session-submitted-dup', v_target, v_key, '1',
      array['a','b'], 'a', array['b'], 0.5,
      v_now + interval '15 minutes', 'assessment_item'
    );
    raise exception 'study_v7_canary_expected_submitted_guard';
  exception when others then
    if sqlerrm <> 'study_assessment_item_already_submitted' then raise; end if;
  end;

  -- Delayed retention: seven full days must survive issue -> grade -> ledger.
  v_key := 'study-v7-canary-retention-' || right(v_retention::text, 12);
  insert into public.study_assessment_attempts (
    id, user_sub, session_id, concept_id, item_key, item_version,
    option_ids, correct_option_id, misconception_option_ids, difficulty,
    expires_at, evidence_kind, evidence_concept_id, retention_anchor_at
  ) values (
    v_retention, v_user, 'canary-session-retention', v_source, v_key, '1',
    array['a','b'], 'a', array['b'], 0.5,
    v_now + interval '15 minutes', 'retention_probe', null, v_now - interval '7 days 2 hours'
  );
  select * into v_result
  from public.complete_study_assessment_attempt(v_user, v_retention, 'a', v_now);
  if v_result.result_status <> 'graded'
    or v_result.result_evidence_kind is distinct from 'retention_probe'
    or v_result.result_evidence_concept_id is distinct from v_source
    or v_result.result_delay_days is distinct from 7 then
    raise exception 'study_v7_canary_retention_contract';
  end if;
  select count(*) into v_count
  from public.study_mastery_events
  where user_sub = v_user
    and assessment_ref = 'attempt:' || v_retention::text
    and concept_id = v_source
    and event_kind = 'retention_probe'
    and delay_days = 7
    and independent = true;
  if v_count <> 1 then raise exception 'study_v7_canary_retention_event_contract'; end if;

  -- Governed transfer: the item belongs to the target concept, while evidence
  -- is credited to the source concept represented by evidence_concept_id.
  v_key := 'study-v7-canary-transfer-' || right(v_transfer::text, 12);
  insert into public.study_assessment_attempts (
    id, user_sub, session_id, concept_id, item_key, item_version,
    option_ids, correct_option_id, misconception_option_ids, difficulty,
    expires_at, evidence_kind, evidence_concept_id, retention_anchor_at
  ) values (
    v_transfer, v_user, 'canary-session-transfer', v_target, v_key, '1',
    array['a','b'], 'a', array['b'], 0.5,
    v_now + interval '15 minutes', 'transfer', v_source, null
  );
  select * into v_result
  from public.complete_study_assessment_attempt(v_user, v_transfer, 'a', v_now);
  if v_result.result_status <> 'graded'
    or v_result.result_concept_id is distinct from v_target
    or v_result.result_evidence_kind is distinct from 'transfer'
    or v_result.result_evidence_concept_id is distinct from v_source
    or v_result.result_delay_days is not null then
    raise exception 'study_v7_canary_transfer_contract';
  end if;
  select count(*) into v_count
  from public.study_mastery_events
  where user_sub = v_user
    and assessment_ref = 'attempt:' || v_transfer::text
    and concept_id = v_source
    and event_kind = 'transfer'
    and independent = true;
  if v_count <> 1 then raise exception 'study_v7_canary_transfer_event_contract'; end if;

  -- Schema must fail closed for malformed retention/transfer metadata.
  begin
    insert into public.study_assessment_attempts (
      id, user_sub, session_id, concept_id, item_key, item_version,
      option_ids, correct_option_id, misconception_option_ids, difficulty,
      expires_at, evidence_kind, retention_anchor_at
    ) values (
      v_bad, v_user, 'canary-bad-retention', v_source,
      'study-v7-canary-bad-retention-' || right(v_bad::text, 12), '1',
      array['a','b'], 'a', array['b'], 0.5,
      v_now + interval '15 minutes', 'retention_probe', null
    );
    raise exception 'study_v7_canary_expected_retention_constraint';
  exception when check_violation then null;
  end;

  v_bad := gen_random_uuid();
  begin
    insert into public.study_assessment_attempts (
      id, user_sub, session_id, concept_id, item_key, item_version,
      option_ids, correct_option_id, misconception_option_ids, difficulty,
      expires_at, evidence_kind, evidence_concept_id
    ) values (
      v_bad, v_user, 'canary-bad-transfer', v_source,
      'study-v7-canary-bad-transfer-' || right(v_bad::text, 12), '1',
      array['a','b'], 'a', array['b'], 0.5,
      v_now + interval '15 minutes', 'transfer', v_source
    );
    raise exception 'study_v7_canary_expected_transfer_constraint';
  exception when check_violation then null;
  end;

  v_bad := gen_random_uuid();
  begin
    insert into public.study_assessment_attempts (
      id, user_sub, session_id, concept_id, item_key, item_version,
      option_ids, correct_option_id, misconception_option_ids, difficulty,
      expires_at, evidence_kind, evidence_concept_id
    ) values (
      v_bad, v_user, 'canary-bad-ordinary', v_source,
      'study-v7-canary-bad-ordinary-' || right(v_bad::text, 12), '1',
      array['a','b'], 'a', array['b'], 0.5,
      v_now + interval '15 minutes', 'assessment_item', v_target
    );
    raise exception 'study_v7_canary_expected_nontransfer_constraint';
  exception when check_violation then null;
  end;
end $$;

rollback;
