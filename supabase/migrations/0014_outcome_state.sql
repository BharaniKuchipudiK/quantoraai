-- Versioned, owner-scoped source of truth for Quantora's Communication Layer.

create table if not exists public.outcome_states (
  id          bigserial primary key,
  user_sub    text not null references public.users(google_sub) on delete cascade,
  session_id  text not null,
  version     integer not null default 1 check (version > 0),
  state       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_sub, session_id)
);

create table if not exists public.outcome_state_versions (
  id               bigserial primary key,
  outcome_state_id bigint not null references public.outcome_states(id) on delete cascade,
  version          integer not null,
  state            jsonb not null,
  source_turn      text,
  created_at       timestamptz not null default now(),
  unique (outcome_state_id, version)
);

create index if not exists outcome_states_owner_updated_idx
  on public.outcome_states (user_sub, updated_at desc);

alter table public.outcome_states enable row level security;
alter table public.outcome_state_versions enable row level security;
revoke all on public.outcome_states from anon, authenticated;
revoke all on public.outcome_state_versions from anon, authenticated;

create or replace function public.save_outcome_state(
  p_user_sub text,
  p_session_id text,
  p_expected_version integer,
  p_state jsonb,
  p_source_turn text default null
) returns setof public.outcome_states
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.outcome_states%rowtype;
begin
  select * into current_row
  from public.outcome_states
  where user_sub = p_user_sub and session_id = p_session_id
  for update;

  if not found then
    if p_expected_version <> 0 then
      raise exception 'outcome_version_conflict' using errcode = '40001';
    end if;

    insert into public.outcome_states (user_sub, session_id, version, state)
    values (p_user_sub, p_session_id, 1, p_state)
    returning * into current_row;
  else
    if current_row.version <> p_expected_version then
      raise exception 'outcome_version_conflict' using errcode = '40001';
    end if;

    update public.outcome_states
    set state = p_state, version = version + 1, updated_at = now()
    where id = current_row.id
    returning * into current_row;
  end if;

  insert into public.outcome_state_versions (outcome_state_id, version, state, source_turn)
  values (current_row.id, current_row.version, current_row.state, nullif(p_source_turn, ''));

  return next current_row;
end;
$$;

revoke all on function public.save_outcome_state(text, text, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_outcome_state(text, text, integer, jsonb, text) to service_role;
