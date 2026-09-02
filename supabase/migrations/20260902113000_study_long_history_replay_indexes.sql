-- Study H3.3 — support deterministic append-order full replay at scale.
--
-- Learner projection semantics remain ordered by observed_at after rows are
-- loaded, but replay completeness and future checkpoint deltas use the
-- server-owned append cursor (created_at, id). These indexes keep the bounded
-- replay reads aligned with that physical access path.

create index if not exists study_mastery_events_owner_concept_append_idx
  on public.study_mastery_events (user_sub, concept_id, created_at, id);

-- Receipt validation can target either the item concept or, for governed
-- transfer evidence, the evidence concept. Keep both submitted branches aligned
-- with the deterministic issuance cursor used by H3.3 validation reads.
create index if not exists study_assessment_attempts_owner_concept_issued_submitted_idx
  on public.study_assessment_attempts (user_sub, concept_id, issued_at, id)
  where submitted_at is not null;

create index if not exists study_assessment_attempts_owner_evidence_concept_issued_submitted_idx
  on public.study_assessment_attempts (user_sub, evidence_concept_id, issued_at, id)
  where submitted_at is not null and evidence_concept_id is not null;
