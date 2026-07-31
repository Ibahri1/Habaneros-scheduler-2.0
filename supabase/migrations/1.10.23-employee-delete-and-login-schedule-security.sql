-- Add employee deletion cleanup and employee-login schedule viewing.
-- Run after 1.10.21-next-monday-availability-submissions.sql.

alter table public.employees add column if not exists deleted_at timestamptz;

drop function if exists public.get_public_published_schedule(date, text);

drop function if exists public.employee_phone_lookup(text);
create function public.employee_phone_lookup(p_employee_code text)
returns table (employee_id uuid, local_worker_id text, employee_name text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_employee public.employees%rowtype;
begin
  if p_employee_code !~ '^\d{4}$' then
    raise exception 'Invalid employee login.';
  end if;

  select e.*
  into v_employee
  from public.employees as e
  where e.employee_code_hash = encode(digest(p_employee_code, 'sha256'), 'hex')
  limit 1;

  if v_employee.id is null then
    raise exception 'Invalid employee login.';
  end if;

  if not v_employee.active or v_employee.deleted_at is not null then
    raise exception 'This employee account is no longer active.';
  end if;

  return query
  select v_employee.id, v_employee.local_worker_id, v_employee.name;
end;
$$;

create or replace function public.manager_deactivate_employee(p_local_worker_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(p_local_worker_id, '')), '') is null then
    raise exception 'Employee id is required.';
  end if;

  update public.employees as e
  set active = false,
      deleted_at = coalesce(e.deleted_at, now()),
      updated_at = now()
  where e.local_worker_id = p_local_worker_id;

  if not found then
    raise exception 'Employee was not found in Supabase.';
  end if;
end;
$$;

create or replace function public.manager_upsert_employee(
  p_local_worker_id text,
  p_name text,
  p_employee_code text,
  p_active boolean,
  p_no_hour_limits boolean,
  p_mobile_phone text default ''
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_employee_code !~ '^\d{4}$' then
    raise exception 'Employee code must be 4 digits';
  end if;

  insert into public.employees (
    local_worker_id,
    name,
    employee_code_hash,
    active,
    no_hour_limits,
    mobile_phone,
    deleted_at,
    updated_at
  )
  values (
    p_local_worker_id,
    p_name,
    encode(digest(p_employee_code, 'sha256'), 'hex'),
    p_active,
    coalesce(p_no_hour_limits, false),
    left(coalesce(p_mobile_phone, ''), 40),
    case when p_active then null else now() end,
    now()
  )
  on conflict (local_worker_id) do update
    set name = excluded.name,
        employee_code_hash = excluded.employee_code_hash,
        active = excluded.active,
        no_hour_limits = excluded.no_hour_limits,
        mobile_phone = excluded.mobile_phone,
        deleted_at = case when excluded.active then null else coalesce(public.employees.deleted_at, now()) end,
        updated_at = now();
end;
$$;

create or replace function public.get_employee_published_schedule(
  p_employee_code text,
  p_week_start date,
  p_workspace_slug text default null
)
returns table(id uuid, workspace_slug text, week_start date, schedule_json jsonb, published_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_employee public.employees%rowtype;
begin
  if p_employee_code !~ '^\d{4}$' then
    raise exception 'Invalid employee login.';
  end if;

  select e.*
  into v_employee
  from public.employees as e
  where e.employee_code_hash = encode(digest(p_employee_code, 'sha256'), 'hex')
  limit 1;

  if v_employee.id is null then
    raise exception 'Invalid employee login.';
  end if;

  if not v_employee.active or v_employee.deleted_at is not null then
    raise exception 'This employee account is no longer active.';
  end if;

  return query
  select ps.id, w.slug, ps.week_start, ps.schedule_json, ps.published_at
  from public.published_schedules as ps
  join public.workspaces as w on w.id = ps.workspace_id
  where ps.week_start = p_week_start
    and (p_workspace_slug is null or p_workspace_slug = '' or w.slug = p_workspace_slug)
    and (v_employee.workspace_id is null or v_employee.workspace_id = ps.workspace_id)
  order by ps.updated_at desc
  limit 1;
end;
$$;

revoke all on function public.employee_phone_lookup(text) from public;
revoke all on function public.manager_deactivate_employee(text) from public;
revoke all on function public.manager_upsert_employee(text, text, text, boolean, boolean, text) from public;
revoke all on function public.get_employee_published_schedule(text, date, text) from public;

grant execute on function public.employee_phone_lookup(text) to anon;
grant execute on function public.manager_deactivate_employee(text) to anon;
grant execute on function public.manager_upsert_employee(text, text, text, boolean, boolean, text) to anon;
grant execute on function public.get_employee_published_schedule(text, date, text) to anon, authenticated;

notify pgrst, 'reload schema';
