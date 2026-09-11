-- QIR worker ownership: durable lease / heartbeat / reclaim.
--
-- This does not move Coding execution to the worker. It only establishes the
-- exclusive ownership primitive a background worker must have before it is
-- allowed to execute consequential work against a durable Agent Run.

create table if not exists public.qir_worker_leases (
  user_sub text not null,
  run_id text not null,
  worker_id text not null,
  lease_token text not null,
  leased_until timestamptz not null,
  heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_sub, run_id),
  constraint qir_worker_leases_run_fk foreign key (user_sub, run_id)
    references public.qir_runs(user_sub, run_id) on delete cascade,
  constraint qir_worker_leases_worker_required check (length(trim(worker_id)) between 1 and 191),
  constraint qir_worker_leases_token_required check (length(trim(lease_token)) between 1 and 191)
);

create index if not exists qir_worker_leases_expiry_idx
  on public.qir_worker_leases (leased_until);

alter table public.qir_worker_leases enable row level security;
revoke all on table public.qir_worker_leases from public, anon, authenticated;
grant select, insert, update, delete on table public.qir_worker_leases to service_role;

-- Atomic claim/reclaim. A live lease owned by somebody else is never stolen.
-- Once it expires, exactly one caller wins the row lock and becomes owner.
create or replace function public.claim_qir_worker_lease(
  p_user_sub text,
  p_run_id text,
  p_worker_id text,
  p_lease_token text,
  p_ttl_seconds integer
)
returns table (
  acquired boolean,
  worker_id text,
  lease_token text,
  leased_until timestamptz,
  heartbeat_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.qir_worker_leases%rowtype;
begin
  if coalesce(trim(p_user_sub), '') = ''
    or coalesce(trim(p_run_id), '') = ''
    or coalesce(trim(p_worker_id), '') = ''
    or coalesce(trim(p_lease_token), '') = '' then
    raise exception 'qir_worker_lease_identity_required';
  end if;
  if p_ttl_seconds < 5 or p_ttl_seconds > 300 then
    raise exception 'qir_worker_lease_ttl_invalid';
  end if;

  -- Fast path for a brand-new Run lease. ON CONFLICT keeps concurrent first
  -- claimers safe; the locked read below decides who actually owns it.
  insert into public.qir_worker_leases(
    user_sub, run_id, worker_id, lease_token, leased_until, heartbeat_at
  ) values (
    p_user_sub, p_run_id, p_worker_id, p_lease_token,
    v_now + make_interval(secs => p_ttl_seconds), v_now
  )
  on conflict (user_sub, run_id) do nothing;

  select * into v_row
  from public.qir_worker_leases
  where user_sub = p_user_sub and run_id = p_run_id
  for update;

  if not found then
    raise exception 'qir_run_not_found';
  end if;

  if (v_row.worker_id = p_worker_id and v_row.lease_token = p_lease_token)
     or v_row.leased_until <= v_now then
    update public.qir_worker_leases
    set worker_id = p_worker_id,
        lease_token = p_lease_token,
        leased_until = v_now + make_interval(secs => p_ttl_seconds),
        heartbeat_at = v_now,
        updated_at = v_now
    where user_sub = p_user_sub and run_id = p_run_id
    returning * into v_row;
  end if;

  return query select
    (v_row.worker_id = p_worker_id and v_row.lease_token = p_lease_token and v_row.leased_until > v_now),
    v_row.worker_id,
    v_row.lease_token,
    v_row.leased_until,
    v_row.heartbeat_at;
end;
$$;

-- Renew only a lease that is still live and still belongs to this exact
-- worker/token pair. An expired owner cannot resurrect itself after another
-- worker became eligible to reclaim the Run.
create or replace function public.heartbeat_qir_worker_lease(
  p_user_sub text,
  p_run_id text,
  p_worker_id text,
  p_lease_token text,
  p_ttl_seconds integer
)
returns table (
  renewed boolean,
  leased_until timestamptz,
  heartbeat_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.qir_worker_leases%rowtype;
begin
  if p_ttl_seconds < 5 or p_ttl_seconds > 300 then
    raise exception 'qir_worker_lease_ttl_invalid';
  end if;

  select * into v_row
  from public.qir_worker_leases
  where user_sub = p_user_sub and run_id = p_run_id
  for update;

  if not found
     or v_row.worker_id <> p_worker_id
     or v_row.lease_token <> p_lease_token
     or v_row.leased_until <= v_now then
    return query select false, v_row.leased_until, v_row.heartbeat_at;
    return;
  end if;

  update public.qir_worker_leases
  set leased_until = v_now + make_interval(secs => p_ttl_seconds),
      heartbeat_at = v_now,
      updated_at = v_now
  where user_sub = p_user_sub and run_id = p_run_id
  returning * into v_row;

  return query select true, v_row.leased_until, v_row.heartbeat_at;
end;
$$;

create or replace function public.release_qir_worker_lease(
  p_user_sub text,
  p_run_id text,
  p_worker_id text,
  p_lease_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.qir_worker_leases
  where user_sub = p_user_sub
    and run_id = p_run_id
    and worker_id = p_worker_id
    and lease_token = p_lease_token;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

revoke all on function public.claim_qir_worker_lease(text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.heartbeat_qir_worker_lease(text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.release_qir_worker_lease(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_qir_worker_lease(text, text, text, text, integer) to service_role;
grant execute on function public.heartbeat_qir_worker_lease(text, text, text, text, integer) to service_role;
grant execute on function public.release_qir_worker_lease(text, text, text, text) to service_role;
