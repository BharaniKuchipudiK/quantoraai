-- Study Truth Layer v1
-- Canonical/versioned knowledge is separated from private learner evidence.
-- Learner events are the durable source of truth; mastery estimates are derived
-- and may be recomputed when Quantora improves its estimator.

create table if not exists public.study_concepts (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null check (
    char_length(canonical_key) between 1 and 160
    and canonical_key ~ '^[a-z0-9][a-z0-9._:-]*$'
  ),
  content_version text not null check (char_length(content_version) between 1 and 80),
  subject text not null check (
    char_length(subject) between 1 and 100
    and subject ~ '^[a-z0-9][a-z0-9._:-]*$'
  ),
  label text not null check (char_length(label) between 1 and 300),
  description text check (description is null or char_length(description) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  provenance text not null check (provenance in (
    'official', 'open_licensed', 'quantora_authored', 'connected_source', 'derived'
  )),
  confidence double precision not null default 0.5 check (confidence between 0 and 1),
  source_ref text check (source_ref is null or char_length(source_ref) <= 2000),
  license_ref text check (license_ref is null or char_length(license_ref) <= 1000),
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_key, content_version),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create index if not exists study_concepts_active_key_idx
  on public.study_concepts (canonical_key, updated_at desc)
  where status = 'active';
create index if not exists study_concepts_subject_status_idx
  on public.study_concepts (subject, status, canonical_key);

create table if not exists public.study_concept_edges (
  id uuid primary key default gen_random_uuid(),
  source_concept_id uuid not null references public.study_concepts(id) on delete cascade,
  target_concept_id uuid not null references public.study_concepts(id) on delete cascade,
  relation text not null check (relation in (
    'prerequisite_of', 'part_of', 'application_of', 'commonly_confused_with', 'supports_transfer_to'
  )),
  confidence double precision not null default 0.5 check (confidence between 0 and 1),
  provenance text not null check (provenance in (
    'official', 'open_licensed', 'quantora_authored', 'connected_source', 'derived'
  )),
  source_ref text check (source_ref is null or char_length(source_ref) <= 2000),
  created_at timestamptz not null default now(),
  unique (source_concept_id, target_concept_id, relation),
  check (source_concept_id <> target_concept_id)
);

create index if not exists study_edges_source_relation_idx
  on public.study_concept_edges (source_concept_id, relation, target_concept_id);
create index if not exists study_edges_target_relation_idx
  on public.study_concept_edges (target_concept_id, relation, source_concept_id);

create table if not exists public.study_curricula (
  id uuid primary key default gen_random_uuid(),
  curriculum_key text not null check (
    char_length(curriculum_key) between 1 and 160
    and curriculum_key ~ '^[a-z0-9][a-z0-9._:-]*$'
  ),
  jurisdiction text not null check (
    char_length(jurisdiction) between 1 and 80
    and jurisdiction ~ '^[a-z0-9][a-z0-9._:-]*$'
  ),
  authority text not null check (char_length(authority) between 1 and 200),
  name text not null check (char_length(name) between 1 and 300),
  version text not null check (char_length(version) between 1 and 100),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  source_ref text not null check (char_length(source_ref) between 1 and 2000),
  effective_from timestamptz,
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (curriculum_key, version),
  check (effective_until is null or effective_from is null or effective_until >= effective_from)
);

create index if not exists study_curricula_active_idx
  on public.study_curricula (jurisdiction, status, curriculum_key);

create table if not exists public.study_curriculum_mappings (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.study_curricula(id) on delete cascade,
  concept_id uuid not null references public.study_concepts(id) on delete cascade,
  objective_code text not null default '' check (char_length(objective_code) <= 160),
  stage text not null default '' check (char_length(stage) <= 160),
  depth double precision not null default 0.5 check (depth between 0 and 1),
  exam_weight double precision check (exam_weight is null or exam_weight between 0 and 1),
  confidence double precision not null default 0.5 check (confidence between 0 and 1),
  source_ref text not null check (char_length(source_ref) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (curriculum_id, concept_id, objective_code, stage)
);

create index if not exists study_mappings_curriculum_stage_idx
  on public.study_curriculum_mappings (curriculum_id, stage, concept_id);
create index if not exists study_mappings_concept_idx
  on public.study_curriculum_mappings (concept_id, curriculum_id);

create table if not exists public.study_mastery_events (
  id uuid primary key default gen_random_uuid(),
  user_sub text not null references public.users(google_sub) on delete cascade,
  concept_id uuid not null references public.study_concepts(id) on delete restrict,
  event_kind text not null check (event_kind in (
    'assessment_item', 'retrieval', 'application', 'transfer', 'teach_back',
    'retention_probe', 'misconception_probe', 'self_confidence'
  )),
  correct boolean,
  score double precision check (score is null or score between 0 and 1),
  difficulty double precision check (difficulty is null or difficulty between 0 and 1),
  hints_used integer not null default 0 check (hints_used between 0 and 100),
  response_ms integer check (response_ms is null or response_ms between 0 and 86400000),
  self_confidence double precision check (self_confidence is null or self_confidence between 0 and 1),
  independent boolean not null default true,
  misconception_signal boolean not null default false,
  delay_days integer check (delay_days is null or delay_days between 0 and 3650),
  provenance text not null check (provenance in (
    'official', 'open_licensed', 'quantora_authored', 'connected_source', 'derived'
  )),
  source_ref text check (source_ref is null or char_length(source_ref) <= 2000),
  assessment_ref text check (assessment_ref is null or char_length(assessment_ref) <= 500),
  item_ref text check (item_ref is null or char_length(item_ref) <= 500),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (correct is not null or score is not null or event_kind = 'self_confidence' or misconception_signal = true)
);

create index if not exists study_mastery_events_owner_concept_time_idx
  on public.study_mastery_events (user_sub, concept_id, observed_at desc);
create index if not exists study_mastery_events_owner_time_idx
  on public.study_mastery_events (user_sub, observed_at desc);

create table if not exists public.study_mastery_estimates (
  user_sub text not null references public.users(google_sub) on delete cascade,
  concept_id uuid not null references public.study_concepts(id) on delete restrict,
  status text not null check (status in ('insufficient_evidence', 'provisional', 'established')),
  mastery double precision check (mastery is null or mastery between 0 and 1),
  confidence double precision not null default 0 check (confidence between 0 and 1),
  retention double precision check (retention is null or retention between 0 and 1),
  misconception_risk double precision not null default 0 check (misconception_risk between 0 and 1),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  effective_evidence_weight double precision not null default 0 check (effective_evidence_weight >= 0),
  estimator_version text not null check (char_length(estimator_version) between 1 and 160),
  reason_codes text[] not null default '{}'::text[],
  observed_through timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_sub, concept_id),
  check ((status = 'insufficient_evidence' and mastery is null) or status <> 'insufficient_evidence')
);

create index if not exists study_mastery_estimates_owner_status_idx
  on public.study_mastery_estimates (user_sub, status, updated_at desc);

-- Public schema is exposed by many Supabase projects. These tables are server-
-- managed in v1: RLS is enabled as defense in depth and browser roles receive
-- no table privileges. The service role is granted only what the server needs.
alter table public.study_concepts enable row level security;
alter table public.study_concept_edges enable row level security;
alter table public.study_curricula enable row level security;
alter table public.study_curriculum_mappings enable row level security;
alter table public.study_mastery_events enable row level security;
alter table public.study_mastery_estimates enable row level security;

revoke all on public.study_concepts from public, anon, authenticated;
revoke all on public.study_concept_edges from public, anon, authenticated;
revoke all on public.study_curricula from public, anon, authenticated;
revoke all on public.study_curriculum_mappings from public, anon, authenticated;
revoke all on public.study_mastery_events from public, anon, authenticated;
revoke all on public.study_mastery_estimates from public, anon, authenticated;

grant select, insert, update, delete on public.study_concepts to service_role;
grant select, insert, update, delete on public.study_concept_edges to service_role;
grant select, insert, update, delete on public.study_curricula to service_role;
grant select, insert, update, delete on public.study_curriculum_mappings to service_role;
grant select, insert on public.study_mastery_events to service_role;
grant select, insert, update, delete on public.study_mastery_estimates to service_role;
