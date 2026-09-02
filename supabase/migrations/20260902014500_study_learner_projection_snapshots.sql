-- Study H3.2 — durable learner projection snapshots.
--
-- The event ledger remains authoritative. This table stores only disposable,
-- versioned projections so a future bounded replay path can accelerate reads.
-- Browser roles receive no privileges.

create table if not exists public.study_learner_snapshots (
  user_sub text not null references public.users(google_sub) on delete cascade,
  concept_id uuid not null references public.study_concepts(id) on delete cascade,
  schema_version text not null check (char_length(schema_version) between 1 and 160),
  learner_model_version text not null check (char_length(learner_model_version) between 1 and 160),
  estimator_version text not null check (char_length(estimator_version) between 1 and 160),
  observed_through timestamptz,
  projected_at timestamptz not null,
  projection jsonb not null check (jsonb_typeof(projection) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_sub, concept_id)
);

create index if not exists study_learner_snapshots_owner_updated_idx
  on public.study_learner_snapshots (user_sub, updated_at desc);

alter table public.study_learner_snapshots enable row level security;
revoke all on public.study_learner_snapshots from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.study_learner_snapshots to service_role;

-- Save only when this projection is at least as recent as the stored ledger
-- cursor. This prevents a concurrent older replay from overwriting a newer
-- snapshot. Equal cursors are allowed so estimator/schema upgrades and
-- time-sensitive learner-model changes may refresh derived state safely.
create or replace function public.save_study_learner_snapshot(
  p_user_sub text,
  p_concept_id uuid,
  p_schema_version text,
  p_learner_model_version text,
  p_estimator_version text,
  p_observed_through timestamptz,
  p_projected_at timestamptz,
  p_projection jsonb
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rows integer := 0;
begin
  insert into public.study_learner_snapshots (
    user_sub,
    concept_id,
    schema_version,
    learner_model_version,
    estimator_version,
    observed_through,
    projected_at,
    projection,
    updated_at
  ) values (
    p_user_sub,
    p_concept_id,
    p_schema_version,
    p_learner_model_version,
    p_estimator_version,
    p_observed_through,
    p_projected_at,
    p_projection,
    now()
  )
  on conflict (user_sub, concept_id) do update
  set
    schema_version = excluded.schema_version,
    learner_model_version = excluded.learner_model_version,
    estimator_version = excluded.estimator_version,
    observed_through = excluded.observed_through,
    projected_at = excluded.projected_at,
    projection = excluded.projection,
    updated_at = now()
  where
    study_learner_snapshots.observed_through is null
    or (
      excluded.observed_through is not null
      and excluded.observed_through >= study_learner_snapshots.observed_through
    );

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.save_study_learner_snapshot(
  text, uuid, text, text, text, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.save_study_learner_snapshot(
  text, uuid, text, text, text, timestamptz, timestamptz, jsonb
) to service_role;
