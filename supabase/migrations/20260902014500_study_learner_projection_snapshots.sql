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
grant select, insert, update on public.study_learner_snapshots to service_role;

-- One round trip classifies and synchronizes the derived snapshot.
--
-- - snapshot_ahead: an older replay must never regress a newer ledger cursor.
-- - current: the semantic projection is unchanged; projectedAt alone does not
--   create a write.
-- - saved: missing, version-changed, ledger-advanced, or time-sensitive derived
--   state was refreshed.
--
-- The ON CONFLICT predicate is still monotonic even after the FOR UPDATE read,
-- protecting the no-existing-row race where two transactions insert together.
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
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_existing public.study_learner_snapshots%rowtype;
  v_rows integer := 0;
begin
  select *
  into v_existing
  from public.study_learner_snapshots
  where user_sub = p_user_sub
    and concept_id = p_concept_id
  for update;

  if found then
    if v_existing.observed_through is not null
      and (
        p_observed_through is null
        or v_existing.observed_through > p_observed_through
      ) then
      return 'snapshot_ahead';
    end if;

    if v_existing.schema_version = p_schema_version
      and v_existing.learner_model_version = p_learner_model_version
      and v_existing.estimator_version = p_estimator_version
      and v_existing.observed_through is not distinct from p_observed_through
      and (v_existing.projection - 'projectedAt') = (p_projection - 'projectedAt') then
      return 'current';
    end if;
  end if;

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
  if v_rows = 0 then
    return 'snapshot_ahead';
  end if;
  return 'saved';
end;
$$;

revoke all on function public.save_study_learner_snapshot(
  text, uuid, text, text, text, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.save_study_learner_snapshot(
  text, uuid, text, text, text, timestamptz, timestamptz, jsonb
) to service_role;
