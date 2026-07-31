-- Fix ambiguous output-column references in employee sync RPCs.
-- The previous manager_upsert_employee function returned a TABLE column named
-- local_worker_id while also querying employees.local_worker_id. In PL/pgSQL,
-- RETURNS TABLE columns are variables, so avoid RETURN QUERY statements that can
-- collide with table columns by assigning outputs explicitly.

alter table public.employees add column if not exists deleted_at timestamptz;
alter table public.employees add column if not exists calendar_token text;
alter table public.employees add column if not exists calendar_token_created_at timestamptz;
alter table public.employees add column if not exists calendar_token_revoked_at timestamptz;

create unique index if not exists employees_calendar_token_unique
on public.employees(calendar_token)
where calendar_token is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.employees'::regclass
      and conname = 'employees_local_worker_id_key'
  ) then
    alter table public.employees
      add constraint employees_local_worker_id_key unique (local_worker_id);
  end if;
end;
$$;

drop function if exists public.employee_phone_lookup(text);
drop function if exists public.manager_upsert_employee(text, text, text, boolean, boolean, text, text);
drop function if exists public.manager_reset_employee_calendar_token(text);

create or replace function public.employee_phone_lookup(p_employee_code text)
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

  employee_id := v_employee.id;
  local_worker_id := v_employee.local_worker_id;
  employee_name := v_employee.name;
  calendar_token := v_employee.calendar_token;
  return next;
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
  v_return_local_worker_id text;
  v_return_calendar_token text;
begin
  if p_employee_code !~ '^\d{4}$' then
    raise exception 'Employee code must contain 4 digits';
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
  on conflict on constraint employees_local_worker_id_key do update
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

  select e.local_worker_id, e.calendar_token
  into v_return_local_worker_id, v_return_calendar_token
  from public.employees as e
  where e.local_worker_id = p_local_worker_id;

  local_worker_id := v_return_local_worker_id;
  calendar_token := v_return_calendar_token;
  return next;
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

  calendar_token := v_token;
  return next;
end;
$$;

revoke all on function public.employee_phone_lookup(text) from public;
revoke all on function public.manager_upsert_employee(text, text, text, boolean, boolean, text, text) from public;
revoke all on function public.manager_reset_employee_calendar_token(text) from public;

grant execute on function public.employee_phone_lookup(text) to anon;
grant execute on function public.manager_upsert_employee(text, text, text, boolean, boolean, text, text) to anon;
grant execute on function public.manager_reset_employee_calendar_token(text) to anon;

notify pgrst, 'reload schema';
