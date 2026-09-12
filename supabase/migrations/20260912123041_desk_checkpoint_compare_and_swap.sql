-- A single transaction serializes all writers for one user's desk, including
-- the first save (where there is no row to lock yet).
create or replace function public.replace_desk_checkpoints(
  p_user_sub text, p_session_id text, p_expected_revision bigint, p_rows jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  current_revision bigint;
  next_revision bigint;
begin
  if p_user_sub is null or length(p_user_sub) not between 1 and 200
     or p_session_id is null or length(p_session_id) not between 1 and 200
     or p_expected_revision is null or p_expected_revision < 0
     or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Invalid checkpoint save';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 40 then
    raise exception 'Invalid checkpoint count';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    jsonb_build_array(p_user_sub, p_session_id)::text, 0));
  select coalesce(max(generation), 0) into current_revision
    from public.desk_checkpoints where user_sub = p_user_sub and session_id = p_session_id;
  if current_revision <> p_expected_revision then
    return jsonb_build_object('status', 'conflict');
  end if;
  next_revision := current_revision + 1;
  insert into public.desk_checkpoints
    (user_sub, session_id, generation, checkpoint_id, seq, label, origin, hash, delta)
  select p_user_sub, p_session_id, next_revision, x.checkpoint_id, x.seq,
    x.label, coalesce(x.origin, 'commit'), x.hash, x.delta
  from jsonb_to_recordset(p_rows) as x(checkpoint_id text, seq integer, label text,
    origin text, hash text, delta jsonb);
  delete from public.desk_checkpoints where user_sub = p_user_sub
    and session_id = p_session_id and generation < next_revision;
  return jsonb_build_object('status', 'saved', 'revision', next_revision);
end;
$$;
revoke all on function public.replace_desk_checkpoints(text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.replace_desk_checkpoints(text, text, bigint, jsonb) to service_role;
