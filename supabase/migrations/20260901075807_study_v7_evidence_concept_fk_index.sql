-- Study V7 production-proof follow-up.
--
-- The learner-scoped receipt index starts with user_sub, so PostgreSQL cannot
-- use it efficiently when enforcing the evidence_concept_id foreign key by
-- concept alone. Keep the learner query index and add this narrow FK-support
-- index for concept deletion/referential checks.

create index if not exists study_assessment_attempts_evidence_concept_idx
  on public.study_assessment_attempts (evidence_concept_id)
  where evidence_concept_id is not null;
