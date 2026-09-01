-- Study V7 production drift repair.
--
-- An earlier unrecorded V7 rollout left production with the first version of
-- this constraint, which required a transfer target for transfer evidence but
-- did not require that target to be absent for every other evidence kind.
-- Replace the named constraint so the database matches the merged V7 contract.

alter table public.study_assessment_attempts
  drop constraint if exists study_assessment_attempts_transfer_concept_check;

alter table public.study_assessment_attempts
  add constraint study_assessment_attempts_transfer_concept_check
  check (
    (evidence_kind = 'transfer' and evidence_concept_id is not null and evidence_concept_id <> concept_id)
    or
    (evidence_kind <> 'transfer' and evidence_concept_id is null)
  ) not valid;

alter table public.study_assessment_attempts
  validate constraint study_assessment_attempts_transfer_concept_check;
