-- Covers the concept foreign key for delete/restrict checks and concept-level maintenance.
create index if not exists study_assessment_attempts_concept_idx
  on public.study_assessment_attempts (concept_id);
