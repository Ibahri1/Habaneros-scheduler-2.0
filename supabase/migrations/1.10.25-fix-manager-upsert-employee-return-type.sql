-- Fix return-type migration failures from 1.10.23/1.10.24.
-- This migration is safe to run after 1.10.23 failed partway through.
-- It intentionally drops functions whose return types changed before recreating
-- the latest employee delete/login/calendar subscription definitions.

alter table public.employees add column if not exists deleted_at timestamptz;
alter table public.employees add column if not exists calendar_token text;
alter table public.employees add column if not exists calendar_token_created_at timestamptz;
alter table public.employees add column if not exists calendar_token_revoked_at timestamptz;

create unique index if not exists employees_calendar_token_unique
on public.employees(calendar_token)
where calendar_token is not null;

drop function if exists public.get_public_published_schedule(date, text);

-- These functions changed return type across 1.10.23/1.10.24, so they must be
-- dropped before being recreated.
drop function if exists public.manager_upsert_employee(text, text, text, boolean, boolean);
drop function if exists public.manager_upsert_employee(text, text, text, boolean, boolean, text);
drop function if exists public.manager_upsert_employee(text, text, text, boolean, boolean, text, text);
drop function if exists public.employee_phone_lookup(text);

create or replace function public.generate_employee_calendar_token()
returns text
language sql
volatile
security definer
set search_path = public, extensions
as $$
  select encode(gen_random_bytes(32), 'hex') || '-' || replace(gen_random_uuid()::text, '-', '');
$$;

create function public.employee_phone_lookup(p_employee_code text)
returns table (employee_id uuid, local_worker_id text, employee_name text, calendar_token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_employee public.employees%rowtype;
  v_token text;
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

  if v_employee.calendar_token is null or v_employee.calendar_token = '' or v_employee.calendar_token_revoked_at is not null then
    loop
      v_token := public.generate_employee_calendar_token();
      update public.employees as e
      set calendar_token = v_token,
          calendar_token_created_at = now(),
          calendar_token_revoked_at = null,
          updated_at = now()
      where e.id = v_employee.id
        and not exists (select 1 from public.employees as other where other.calendar_token = v_token);
      exit when found;
    end loop;
    v_employee.calendar_token := v_token;
  end if;

  return query
  select v_employee.id, v_employee.local_worker_id, v_employee.name, v_employee.calendar_token;
end;
$$;

create function public.manager_upsert_employee(
  p_local_worker_id text,
  p_name text,
  p_employee_code text,
  p_active boolean,
  p_no_hour_limits boolean,
  p_mobile_phone text default '',
  p_calendar_token text default ''
)
returns table(local_worker_id text, calendar_token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
begin
  if p_employee_code !~ '^\d{4}$' then
    raise exception 'Employee code must be 4 digits';
  end if;

  v_token := nullif(trim(coalesce(p_calendar_token, '')), '');
  if v_token is null then
    loop
      v_token := public.generate_employee_calendar_token();
      exit when not exists (select 1 from public.employees as existing where existing.calendar_token = v_token);
    end loop;
  end if;

  insert into public.employees (
    local_worker_id,
    name,
    employee_code_hash,
    active,
    no_hour_limits,
    mobile_phone,
    calendar_token,
    calendar_token_created_at,
    calendar_token_revoked_at,
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
    v_token,
    now(),
    null,
    case when p_active then null else now() end,
    now()
  )
  on conflict (local_worker_id) do update
    set name = excluded.name,
        employee_code_hash = excluded.employee_code_hash,
        active = excluded.active,
        no_hour_limits = excluded.no_hour_limits,
        mobile_phone = excluded.mobile_phone,
        calendar_token = coalesce(nullif(public.employees.calendar_token, ''), excluded.calendar_token),
        calendar_token_created_at = coalesce(public.employees.calendar_token_created_at, now()),
        calendar_token_revoked_at = case when excluded.active then null else coalesce(public.employees.calendar_token_revoked_at, now()) end,
        deleted_at = case when excluded.active then null else coalesce(public.employees.deleted_at, now()) end,
        updated_at = now();

  return query
  select e.local_worker_id, e.calendar_token
  from public.employees as e
  where e.local_worker_id = p_local_worker_id;
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
      calendar_token_revoked_at = coalesce(e.calendar_token_revoked_at, now()),
      updated_at = now()
  where e.local_worker_id = p_local_worker_id;

  if not found then
    raise exception 'Employee was not found in Supabase.';
  end if;
end;
$$;

create or replace function public.manager_reset_employee_calendar_token(p_local_worker_id text)
returns table(calendar_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if nullif(trim(coalesce(p_local_worker_id, '')), '') is null then
    raise exception 'Employee id is required.';
  end if;

  if not exists (
    select 1
    from public.employees as e
    where e.local_worker_id = p_local_worker_id
      and e.active
      and e.deleted_at is null
  ) then
    raise exception 'Active employee was not found in Supabase.';
  end if;

  loop
    v_token := public.generate_employee_calendar_token();
    update public.employees as e
    set calendar_token = v_token,
        calendar_token_created_at = now(),
        calendar_token_revoked_at = null,
        updated_at = now()
    where e.local_worker_id = p_local_worker_id
      and e.active
      and e.deleted_at is null
      and not exists (select 1 from public.employees as other where other.calendar_token = v_token);
    exit when found;
  end loop;

  return query select v_token;
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

revoke all on function public.generate_employee_calendar_token() from public;
revoke all on function public.employee_phone_lookup(text) from public;
revoke all on function public.manager_upsert_employee(text, text, text, boolean, boolean, text, text) from public;
revoke all on function public.manager_deactivate_employee(text) from public;
revoke all on function public.manager_reset_employee_calendar_token(text) from public;
revoke all on function public.get_employee_published_schedule(text, date, text) from public;

grant execute on function public.employee_phone_lookup(text) to anon;
grant execute on function public.manager_upsert_employee(text, text, text, boolean, boolean, text, text) to anon;
grant execute on function public.manager_deactivate_employee(text) to anon;
grant execute on function public.manager_reset_employee_calendar_token(text) to anon;
grant execute on function public.get_employee_published_schedule(text, date, text) to anon, authenticated;

notify pgrst, 'reload schema';
