-- QIR Phase 2: durable Agent Run journal.
-- Operational execution state is deliberately separate from consented semantic memory.

create table if not exists public.qir_runs (
  user_sub text not null,
  run_id text not null,
  version bigint not null default 1,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_sub, run_id),
  constraint qir_runs_version_positive check (version > 0),
  constraint qir_runs_state_object check (jsonb_typeof(state) = 'object')
);

create index if not exists qir_runs_user_updated_idx
  on public.qir_runs (user_sub, updated_at desc);

create table if not exists public.qir_run_events (
  user_sub text not null,
  run_id text not null,
  event_id text not null,
  run_version bigint not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_sub, run_id, event_id),
  constraint qir_run_events_run_fk foreign key (user_sub, run_id)
    references public.qir_runs(user_sub, run_id) on delete cascade,
  constraint qir_run_events_version_positive check (run_version > 0),
  constraint qir_run_events_payload_object check (jsonb_typeof(payload) = 'object')
);

create index if not exists qir_run_events_run_version_idx
  on public.qir_run_events (user_sub, run_id, run_version);

alter table public.qir_runs enable row level security;
alter table public.qir_run_events enable row level security;

revoke all on table public.qir_runs from public, anon, authenticated;
revoke all on table public.qir_run_events from public, anon, authenticated;
grant select, insert, update, delete on table public.qir_runs to service_role;
grant select, insert, update, delete on table public.qir_run_events to service_role;

-- Idempotent creation: a retried create returns the existing Run rather than
-- resetting progress. A run id is immutable within one principal's namespace.
create or replace function public.create_qir_run(
  p_user_sub text,
  p_run_id text,
  p_state jsonb
)
returns setof public.qir_runs
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_user_sub), '') = '' or coalesce(trim(p_run_id), '') = '' then
    raise exception 'qir_run_identity_required';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'qir_run_state_invalid';
  end if;

  insert into public.qir_runs(user_sub, run_id, version, state)
  values (p_user_sub, p_run_id, 1, p_state)
  on conflict (user_sub, run_id) do nothing;

  return query
    select * from public.qir_runs
    where user_sub = p_user_sub and run_id = p_run_id;
end;
$$;

-- Atomic compare-and-swap + append-only event write. event_id is the
-- idempotency key. Retrying an already committed event returns the current Run
-- without consuming another version. A stale writer never overwrites a newer
-- worker's state.
create or replace function public.commit_qir_run_event(
  p_user_sub text,
  p_run_id text,
  p_expected_version bigint,
  p_event_id text,
  p_event_type text,
  p_state jsonb,
  p_payload jsonb default '{}'::jsonb
)
returns setof public.qir_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.qir_runs%rowtype;
  v_next_version bigint;
begin
  if coalesce(trim(p_event_id), '') = '' or coalesce(trim(p_event_type), '') = '' then
    raise exception 'qir_event_identity_required';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'qir_run_state_invalid';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'qir_event_payload_invalid';
  end if;

  select * into v_current
  from public.qir_runs
  where user_sub = p_user_sub and run_id = p_run_id
  for update;

  if not found then
    raise exception 'qir_run_not_found';
  end if;

  if exists (
    select 1 from public.qir_run_events
    where user_sub = p_user_sub and run_id = p_run_id and event_id = p_event_id
  ) then
    return query select * from public.qir_runs
      where user_sub = p_user_sub and run_id = p_run_id;
    return;
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'qir_run_version_conflict';
  end if;

  v_next_version := v_current.version + 1;

  update public.qir_runs
  set version = v_next_version,
      state = p_state,
      updated_at = now()
  where user_sub = p_user_sub and run_id = p_run_id;

  insert into public.qir_run_events(
    user_sub, run_id, event_id, run_version, event_type, payload
  ) values (
    p_user_sub, p_run_id, p_event_id, v_next_version, p_event_type, p_payload
  );

  return query select * from public.qir_runs
    where user_sub = p_user_sub and run_id = p_run_id;
end;
$$;

revoke all on function public.create_qir_run(text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.commit_qir_run_event(text, text, bigint, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_qir_run(text, text, jsonb) to service_role;
grant execute on function public.commit_qir_run_event(text, text, bigint, text, text, jsonb, jsonb) to service_role;
