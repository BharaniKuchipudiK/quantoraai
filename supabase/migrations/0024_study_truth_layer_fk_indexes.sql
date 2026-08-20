-- Cover Study learner-table concept foreign keys for concept-driven joins and
-- referential actions. Owner-first indexes serve learner timelines but do not
-- cover concept_id when it is the leading predicate.

create index if not exists study_mastery_events_concept_time_idx
  on public.study_mastery_events (concept_id, observed_at desc);

create index if not exists study_mastery_estimates_concept_idx
  on public.study_mastery_estimates (concept_id);
