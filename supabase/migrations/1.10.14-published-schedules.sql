-- Published employee schedule snapshots.
-- Run after 1.10.12-auth-workspaces.sql.

create table if not exists public.published_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  week_start date not null,
  schedule_json jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_schedules_workspace_week_unique unique (workspace_id, week_start)
);

alter table public.published_schedules enable row level security;

drop policy if exists "workspace members can read published schedules" on public.published_schedules;
create policy "workspace members can read published schedules"
on public.published_schedules
for select
to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = published_schedules.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace managers can write published schedules" on public.published_schedules;
create policy "workspace managers can write published schedules"
on public.published_schedules
for all
to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = published_schedules.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'manager')
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = published_schedules.workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'manager')
  )
);

create index if not exists published_schedules_workspace_week_idx on public.published_schedules(workspace_id, week_start);
create index if not exists published_schedules_updated_idx on public.published_schedules(updated_at desc);

create or replace function public.publish_schedule_to_employee_domain(p_workspace_id uuid, p_week_start date, p_schedule_json jsonb)
returns table(id uuid, workspace_id uuid, week_start date, schedule_json jsonb, published_at timestamptz, updated_at timestamptz)
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
    raise exception 'You do not have permission to publish this schedule.';
  end if;

  if p_schedule_json is null or jsonb_typeof(p_schedule_json) <> 'object' then
    raise exception 'Schedule data is required.';
  end if;

  return query
  insert into public.published_schedules(workspace_id, week_start, schedule_json, published_at, published_by, updated_at)
  values (p_workspace_id, p_week_start, p_schedule_json, now(), auth.uid(), now())
  on conflict (workspace_id, week_start) do update
    set schedule_json = excluded.schedule_json,
        published_at = excluded.published_at,
        published_by = excluded.published_by,
        updated_at = excluded.updated_at
  returning published_schedules.id, published_schedules.workspace_id, published_schedules.week_start, published_schedules.schedule_json, published_schedules.published_at, published_schedules.updated_at;
end;
$$;

create or replace function public.list_published_schedules(p_workspace_id uuid)
returns table(id uuid, workspace_id uuid, week_start date, published_at timestamptz, updated_at timestamptz)
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
  select ps.id, ps.workspace_id, ps.week_start, ps.published_at, ps.updated_at
  from public.published_schedules ps
  where ps.workspace_id = p_workspace_id
  order by ps.week_start desc;
end;
$$;

create or replace function public.clear_published_schedule(p_workspace_id uuid, p_week_start date)
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
    raise exception 'You do not have permission to clear this schedule.';
  end if;

  delete from public.published_schedules
  where workspace_id = p_workspace_id
    and week_start = p_week_start;
end;
$$;

create or replace function public.clear_all_published_schedules(p_workspace_id uuid)
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
    raise exception 'You do not have permission to clear schedules.';
  end if;

  delete from public.published_schedules
  where workspace_id = p_workspace_id;
end;
$$;

create or replace function public.get_public_published_schedule(p_week_start date, p_workspace_slug text default null)
returns table(id uuid, workspace_slug text, week_start date, schedule_json jsonb, published_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select ps.id, w.slug, ps.week_start, ps.schedule_json, ps.published_at
  from public.published_schedules ps
  join public.workspaces w on w.id = ps.workspace_id
  where ps.week_start = p_week_start
    and (p_workspace_slug is null or p_workspace_slug = '' or w.slug = p_workspace_slug)
  order by ps.updated_at desc
  limit 1;
end;
$$;

revoke all on public.published_schedules from anon, authenticated;

revoke all on function public.publish_schedule_to_employee_domain(uuid, date, jsonb) from public;
revoke all on function public.list_published_schedules(uuid) from public;
revoke all on function public.clear_published_schedule(uuid, date) from public;
revoke all on function public.clear_all_published_schedules(uuid) from public;
revoke all on function public.get_public_published_schedule(date, text) from public;

grant execute on function public.publish_schedule_to_employee_domain(uuid, date, jsonb) to authenticated;
grant execute on function public.list_published_schedules(uuid) to authenticated;
grant execute on function public.clear_published_schedule(uuid, date) to authenticated;
grant execute on function public.clear_all_published_schedules(uuid) to authenticated;
grant execute on function public.get_public_published_schedule(date, text) to anon, authenticated;

notify pgrst, 'reload schema';
