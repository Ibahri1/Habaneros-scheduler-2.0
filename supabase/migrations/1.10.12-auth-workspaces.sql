-- Supabase Auth workspace support for Habaneros Scheduler.
-- This migration is additive and does not remove the existing legacy manager_app_state table.

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Habaneros',
  slug text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'manager', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.workspace_app_state (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  state_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_app_state enable row level security;

drop policy if exists "workspace members can read workspaces" on public.workspaces;
create policy "workspace members can read workspaces"
on public.workspaces
for select
to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace owners can update workspaces" on public.workspaces;
create policy "workspace owners can update workspaces"
on public.workspaces
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "users can read their memberships" on public.workspace_members;
create policy "users can read their memberships"
on public.workspace_members
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "workspace members can read app state" on public.workspace_app_state;
create policy "workspace members can read app state"
on public.workspace_app_state
for select
to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_app_state.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can write app state" on public.workspace_app_state;
create policy "workspace members can write app state"
on public.workspace_app_state
for all
to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_app_state.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'manager')
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_app_state.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'manager')
  )
);

create or replace function public.auth_get_or_create_default_workspace(p_name text default 'Habaneros')
returns table(workspace_id uuid, name text, slug text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_workspace_id uuid;
  base_slug text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select wm.workspace_id
  into existing_workspace_id
  from public.workspace_members wm
  where wm.user_id = current_user_id
  order by wm.created_at asc
  limit 1;

  if existing_workspace_id is null then
    base_slug := lower(regexp_replace(coalesce(nullif(trim(p_name), ''), 'Habaneros'), '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := trim(both '-' from base_slug);
    if base_slug = '' then base_slug := 'habaneros'; end if;
    base_slug := base_slug || '-' || replace(current_user_id::text, '-', '');

    insert into public.workspaces(name, slug, owner_id)
    values (coalesce(nullif(trim(p_name), ''), 'Habaneros'), base_slug, current_user_id)
    returning id into existing_workspace_id;

    insert into public.workspace_members(workspace_id, user_id, role)
    values (existing_workspace_id, current_user_id, 'owner');
  end if;

  return query
  select w.id, w.name, w.slug, wm.role
  from public.workspaces w
  join public.workspace_members wm on wm.workspace_id = w.id
  where w.id = existing_workspace_id
    and wm.user_id = current_user_id;
end;
$$;

create or replace function public.auth_load_workspace_app_state(p_workspace_id uuid)
returns table(state_data jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
  ) then
    raise exception 'You do not have access to this workspace.';
  end if;

  return query
  select was.state_data, was.updated_at
  from public.workspace_app_state was
  where was.workspace_id = p_workspace_id;
end;
$$;

create or replace function public.auth_save_workspace_app_state(p_workspace_id uuid, p_state_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'manager')
  ) then
    raise exception 'You do not have permission to save this workspace.';
  end if;

  insert into public.workspace_app_state(workspace_id, state_data, updated_at, updated_by)
  values (p_workspace_id, coalesce(p_state_data, '{}'::jsonb), now(), auth.uid())
  on conflict (workspace_id) do update
    set state_data = excluded.state_data,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.auth_get_or_create_default_workspace(text) from public;
revoke all on function public.auth_load_workspace_app_state(uuid) from public;
revoke all on function public.auth_save_workspace_app_state(uuid, jsonb) from public;

grant execute on function public.auth_get_or_create_default_workspace(text) to authenticated;
grant execute on function public.auth_load_workspace_app_state(uuid) to authenticated;
grant execute on function public.auth_save_workspace_app_state(uuid, jsonb) to authenticated;

alter table public.employees add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
alter table public.availability_submissions add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
alter table public.availability_reminder_log add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

create index if not exists employees_workspace_id_idx on public.employees(workspace_id);
create index if not exists availability_submissions_workspace_id_idx on public.availability_submissions(workspace_id);
create index if not exists availability_reminder_log_workspace_id_idx on public.availability_reminder_log(workspace_id);
