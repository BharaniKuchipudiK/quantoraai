-- UI checkpoints only. Not a learner evidence table. Browser roles have no access.
create table public.study_session_checkpoints (
  user_sub text not null references public.users(google_sub) on delete cascade,
  session_id text not null check (length(session_id) between 1 and 128),
  revision uuid not null default gen_random_uuid(),
  checkpoint jsonb,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  primary key (user_sub, session_id),
  check (checkpoint is null or coalesce((jsonb_typeof(checkpoint) = 'object'
    and octet_length(checkpoint::text) <= 6000
    and checkpoint->>'version' = 'study-session-continuity-v2'
    and checkpoint->'observationOnly' = 'true'::jsonb
    and checkpoint->>'sessionId' = session_id), false))
);
alter table public.study_session_checkpoints enable row level security;
revoke all on public.study_session_checkpoints from public, anon, authenticated;
grant select, insert, update, delete on public.study_session_checkpoints to service_role;
comment on table public.study_session_checkpoints is 'Expiring account/chat-scoped UI progress; historical hint observations only, never verified learning. Null checkpoints are discard tombstones.';

create function public.write_study_session_checkpoint(
  p_user_sub text, p_session_id text, p_expected_revision uuid, p_checkpoint jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare previous_revision uuid; next_revision uuid := gen_random_uuid();
begin
  if p_user_sub is null or length(p_user_sub) = 0 or p_session_id is null
    or length(p_session_id) not between 1 and 128 then
    raise exception 'invalid checkpoint scope';
  end if;
  -- Serialize one account's bounded set and compare-and-swap in one transaction.
  perform pg_advisory_xact_lock(hashtextextended('study-continuity:' || p_user_sub, 0));
  select revision into previous_revision from public.study_session_checkpoints
    where user_sub = p_user_sub and session_id = p_session_id;
  if previous_revision is distinct from p_expected_revision then
    return jsonb_build_object('outcome', 'conflict');
  end if;
  insert into public.study_session_checkpoints(user_sub, session_id, revision, checkpoint, updated_at, expires_at)
    values(p_user_sub, p_session_id, next_revision, p_checkpoint, clock_timestamp(), now() + interval '7 days')
    on conflict(user_sub, session_id) do update set revision = excluded.revision,
      checkpoint = excluded.checkpoint, updated_at = excluded.updated_at, expires_at = excluded.expires_at;
  -- At most twelve active saved lessons; retain bounded tombstones to prevent replay.
  update public.study_session_checkpoints set checkpoint = null, revision = gen_random_uuid()
    where user_sub = p_user_sub and session_id in (
      select session_id from public.study_session_checkpoints where user_sub = p_user_sub and checkpoint is not null
      order by updated_at desc, session_id limit all offset 12
    );
  delete from public.study_session_checkpoints where user_sub = p_user_sub and session_id <> p_session_id
    and (expires_at <= now() or session_id in (
      select session_id from public.study_session_checkpoints where user_sub = p_user_sub
      order by updated_at desc, session_id limit all offset 24
    ));
  return jsonb_build_object('outcome', 'saved', 'revision', next_revision);
end;
$$;
revoke all on function public.write_study_session_checkpoint(text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.write_study_session_checkpoint(text, text, uuid, jsonb) to service_role;
