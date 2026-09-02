-- Study H3.3 — durable replay checkpoint state.
--
-- The mastery event ledger remains authoritative. These columns add only
-- disposable, versioned replay state plus a server-owned append cursor so
-- checkpoint + bounded delta replay can be proven equivalent to full replay.

alter table public.study_learner_snapshots
  add column if not exists checkpoint_version text;

alter table public.study_learner_snapshots
  add column if not exists admission_version text;

alter table public.study_learner_snapshots
  add column if not exists append_cursor_created_at timestamptz;

alter table public.study_learner_snapshots
  add column if not exists append_cursor_id uuid;

alter table public.study_learner_snapshots
  add column if not exists checkpoint jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'study_learner_snapshots_checkpoint_bundle_check'
  ) then
    alter table public.study_learner_snapshots
      add constraint study_learner_snapshots_checkpoint_bundle_check
      check (
        (
          checkpoint_version is null
          and admission_version is null
          and append_cursor_created_at is null
          and append_cursor_id is null
          and checkpoint is null
        )
        or
        (
          checkpoint_version is not null
          and char_length(checkpoint_version) between 1 and 160
          and admission_version is not null
          and char_length(admission_version) between 1 and 160
          and append_cursor_created_at is not null
          and append_cursor_id is not null
          and checkpoint is not null
          and jsonb_typeof(checkpoint) = 'object'
        )
      );
  end if;
end $$;

-- The primary key already serves exact learner+concept checkpoint reads. This
-- narrow cursor index supports operational inspection without exposing payloads.
create index if not exists study_learner_snapshots_append_cursor_idx
  on public.study_learner_snapshots (append_cursor_created_at desc, append_cursor_id desc)
  where append_cursor_created_at is not null;

create or replace function public.save_study_learner_checkpoint(
  p_user_sub text,
  p_concept_id uuid,
  p_schema_version text,
  p_learner_model_version text,
  p_estimator_version text,
  p_admission_version text,
  p_checkpoint_version text,
  p_observed_through timestamptz,
  p_projected_at timestamptz,
  p_append_cursor_created_at timestamptz,
  p_append_cursor_id uuid,
  p_projection jsonb,
  p_checkpoint jsonb
)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_existing public.study_learner_snapshots%rowtype;
  v_rows integer := 0;
  v_existing_ahead boolean := false;
begin
  select *
  into v_existing
  from public.study_learner_snapshots
  where user_sub = p_user_sub
    and concept_id = p_concept_id
  for update;

  if found and v_existing.append_cursor_created_at is not null then
    v_existing_ahead :=
      v_existing.append_cursor_created_at > p_append_cursor_created_at
      or (
        v_existing.append_cursor_created_at = p_append_cursor_created_at
        and v_existing.append_cursor_id > p_append_cursor_id
      );
    if v_existing_ahead then
      return 'snapshot_ahead';
    end if;

    if v_existing.schema_version = p_schema_version
      and v_existing.learner_model_version = p_learner_model_version
      and v_existing.estimator_version = p_estimator_version
      and v_existing.admission_version = p_admission_version
      and v_existing.checkpoint_version = p_checkpoint_version
      and v_existing.append_cursor_created_at = p_append_cursor_created_at
      and v_existing.append_cursor_id = p_append_cursor_id
      and v_existing.observed_through is not distinct from p_observed_through
      and (v_existing.projection - 'projectedAt') = (p_projection - 'projectedAt')
      and v_existing.checkpoint = p_checkpoint then
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
    checkpoint_version,
    admission_version,
    append_cursor_created_at,
    append_cursor_id,
    checkpoint,
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
    p_checkpoint_version,
    p_admission_version,
    p_append_cursor_created_at,
    p_append_cursor_id,
    p_checkpoint,
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
    checkpoint_version = excluded.checkpoint_version,
    admission_version = excluded.admission_version,
    append_cursor_created_at = excluded.append_cursor_created_at,
    append_cursor_id = excluded.append_cursor_id,
    checkpoint = excluded.checkpoint,
    updated_at = now()
  where
    study_learner_snapshots.append_cursor_created_at is null
    or excluded.append_cursor_created_at > study_learner_snapshots.append_cursor_created_at
    or (
      excluded.append_cursor_created_at = study_learner_snapshots.append_cursor_created_at
      and excluded.append_cursor_id >= study_learner_snapshots.append_cursor_id
    );

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return 'snapshot_ahead';
  end if;
  return 'saved';
end;
$$;

revoke all on function public.save_study_learner_checkpoint(
  text, uuid, text, text, text, text, text, timestamptz, timestamptz,
  timestamptz, uuid, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.save_study_learner_checkpoint(
  text, uuid, text, text, text, text, text, timestamptz, timestamptz,
  timestamptz, uuid, jsonb, jsonb
) to service_role;
