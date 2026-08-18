-- Durable, owner-scoped Project backbone for Quantora's Outcome Graph.
-- Existing browser projects remain valid; this adds cross-device persistence
-- without changing the current chat/session storage contract.

create table if not exists public.projects (
  user_sub     text not null references public.users(google_sub) on delete cascade,
  id           text not null,
  version      integer not null default 1 check (version > 0),
  name         text not null check (char_length(name) between 1 and 120),
  description  text not null default '' check (char_length(description) <= 2000),
  goal         text not null default '' check (char_length(goal) <= 2000),
  status       text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  color        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_sub, id)
);

create index if not exists projects_owner_updated_idx
  on public.projects (user_sub, updated_at desc);

create table if not exists public.project_resources (
  user_sub     text not null,
  project_id   text not null,
  kind         text not null check (char_length(kind) between 1 and 80),
  ref          text not null check (char_length(ref) between 1 and 2000),
  title        text not null default 'Project resource' check (char_length(title) <= 240),
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_sub, project_id, kind, ref),
  foreign key (user_sub, project_id)
    references public.projects(user_sub, id)
    on delete cascade
);

create index if not exists project_resources_owner_project_updated_idx
  on public.project_resources (user_sub, project_id, updated_at desc);

alter table public.projects enable row level security;
alter table public.project_resources enable row level security;
revoke all on public.projects from anon, authenticated;
revoke all on public.project_resources from anon, authenticated;

-- Optimistic concurrency prevents one browser/device silently overwriting a
-- newer Project edit from another device.
create or replace function public.save_project(
  p_user_sub text,
  p_project_id text,
  p_expected_version integer,
  p_name text,
  p_description text default '',
  p_goal text default '',
  p_status text default 'active',
  p_color text default null
) returns setof public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.projects%rowtype;
begin
  select * into current_row
  from public.projects
  where user_sub = p_user_sub and id = p_project_id
  for update;

  if not found then
    if p_expected_version <> 0 then
      raise exception 'project_version_conflict' using errcode = '40001';
    end if;

    insert into public.projects (
      user_sub, id, version, name, description, goal, status, color
    ) values (
      p_user_sub, p_project_id, 1, p_name, coalesce(p_description, ''),
      coalesce(p_goal, ''), coalesce(p_status, 'active'), p_color
    ) returning * into current_row;
  else
    if current_row.version <> p_expected_version then
      raise exception 'project_version_conflict' using errcode = '40001';
    end if;

    update public.projects
    set name = p_name,
        description = coalesce(p_description, ''),
        goal = coalesce(p_goal, ''),
        status = coalesce(p_status, 'active'),
        color = p_color,
        version = version + 1,
        updated_at = now()
    where user_sub = p_user_sub and id = p_project_id
    returning * into current_row;
  end if;

  return next current_row;
end;
$$;

revoke all on function public.save_project(text, text, integer, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_project(text, text, integer, text, text, text, text, text)
  to service_role;
