-- Link existing session Outcome State to durable Projects without changing the
-- proven session-level outcome_states contract or save_outcome_state RPC.

create table if not exists public.project_sessions (
  user_sub    text not null,
  project_id  text not null,
  session_id  text not null check (char_length(session_id) between 1 and 128),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_sub, project_id, session_id),
  foreign key (user_sub, project_id)
    references public.projects(user_sub, id)
    on delete cascade
);

create index if not exists project_sessions_owner_project_idx
  on public.project_sessions (user_sub, project_id, updated_at desc);

create index if not exists project_sessions_owner_session_idx
  on public.project_sessions (user_sub, session_id);

alter table public.project_sessions enable row level security;
revoke all on public.project_sessions from anon, authenticated;

-- Replace the membership list atomically. This keeps deleted/moved chats from
-- continuing to influence a Project's context while remaining isolated by owner.
create or replace function public.sync_project_sessions(
  p_user_sub text,
  p_project_id text,
  p_session_ids text[]
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_ids text[];
  synced_count integer;
begin
  if not exists (
    select 1 from public.projects
    where user_sub = p_user_sub and id = p_project_id
  ) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct value), array[]::text[])
  into clean_ids
  from unnest(coalesce(p_session_ids, array[]::text[])) as value
  where value is not null
    and char_length(value) between 1 and 128
    and value ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]*$';

  -- Hard server-side cap mirrors the application contract and prevents one
  -- Project from turning this sync into an unbounded write.
  if cardinality(clean_ids) > 200 then
    raise exception 'too_many_project_sessions' using errcode = '22023';
  end if;

  delete from public.project_sessions
  where user_sub = p_user_sub
    and project_id = p_project_id
    and not (session_id = any(clean_ids));

  insert into public.project_sessions (user_sub, project_id, session_id, updated_at)
  select p_user_sub, p_project_id, value, now()
  from unnest(clean_ids) as value
  on conflict (user_sub, project_id, session_id)
  do update set updated_at = excluded.updated_at;

  get diagnostics synced_count = row_count;
  return synced_count;
end;
$$;

revoke all on function public.sync_project_sessions(text, text, text[])
  from public, anon, authenticated;
grant execute on function public.sync_project_sessions(text, text, text[])
  to service_role;
