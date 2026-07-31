create extension if not exists pgcrypto with schema extensions;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  local_worker_id text not null unique,
  name text not null check (char_length(name) between 1 and 120),
  employee_code_hash text not null unique,
  active boolean not null default true,
  no_hour_limits boolean not null default false,
  mobile_phone text not null default '',
  calendar_token text,
  calendar_token_created_at timestamptz,
  calendar_token_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.employees add column if not exists no_hour_limits boolean not null default false;
alter table public.employees add column if not exists mobile_phone text not null default '';
alter table public.employees add column if not exists deleted_at timestamptz;
alter table public.employees add column if not exists calendar_token text;
alter table public.employees add column if not exists calendar_token_created_at timestamptz;
alter table public.employees add column if not exists calendar_token_revoked_at timestamptz;
create unique index if not exists employees_calendar_token_unique on public.employees(calendar_token) where calendar_token is not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employees'::regclass
      and conname = 'employees_local_worker_id_key'
  ) then
    alter table public.employees add constraint employees_local_worker_id_key unique (local_worker_id);
  end if;
end;
$$;

create table if not exists public.availability_submissions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  week_start date not null,
  available_days text[] not null default '{}',
  shift_availability jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'applied', 'rejected')),
  reviewed_at timestamptz,
  action_at timestamptz,
  manager_notes text not null default '',
  unique (employee_id, week_start),
  check (available_days <@ array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::text[])
);

alter table public.availability_submissions add column if not exists action_at timestamptz;
alter table public.availability_submissions add column if not exists manager_notes text not null default '';
alter table public.availability_submissions add column if not exists shift_availability jsonb not null default '{}'::jsonb;

alter table public.employees enable row level security;
alter table public.availability_submissions enable row level security;

-- No table policies are created. Anonymous clients can only use the limited functions below.
revoke all on public.employees from anon, authenticated;
revoke all on public.availability_submissions from anon, authenticated;

create or replace function public.generate_employee_calendar_token()
returns text language sql volatile security definer set search_path = public, extensions
as $$ select encode(gen_random_bytes(32), 'hex') || '-' || replace(gen_random_uuid()::text, '-', ''); $$;

create or replace function public.employee_phone_lookup(p_employee_code text)
returns table (employee_id uuid, local_worker_id text, employee_name text, calendar_token text)
language plpgsql security definer set search_path = public, extensions
as $$
declare v_employee public.employees%rowtype; v_token text;
begin
  if p_employee_code !~ '^\d{4}$' then raise exception 'Invalid employee login.'; end if;
  select e.* into v_employee from public.employees e where e.employee_code_hash = encode(digest(p_employee_code, 'sha256'), 'hex') limit 1;
  if v_employee.id is null then raise exception 'Invalid employee login.'; end if;
  if not v_employee.active or v_employee.deleted_at is not null then raise exception 'This employee account is no longer active.'; end if;
  if v_employee.calendar_token is null or v_employee.calendar_token = '' or v_employee.calendar_token_revoked_at is not null then
    loop
      v_token := public.generate_employee_calendar_token();
      update public.employees e set calendar_token = v_token, calendar_token_created_at = now(), calendar_token_revoked_at = null, updated_at = now()
      where e.id = v_employee.id and not exists (select 1 from public.employees other where other.calendar_token = v_token);
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

create or replace function public.submit_employee_availability(p_employee_code text, p_week_start date, p_available_days text[], p_shift_availability jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions
as $$
declare v_employee_id uuid; v_submission_id uuid; v_current_dow integer; v_next_monday date; v_days text[] := array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
begin
  if p_employee_code !~ '^\d{4}$' then raise exception 'Invalid employee code'; end if;
  v_current_dow := extract(dow from current_date)::integer;
  v_next_monday := current_date + case when v_current_dow = 0 then 1 else 8 - v_current_dow end;
  if p_week_start is null or p_week_start <> v_next_monday then raise exception 'Availability can only be submitted for next week.'; end if;
  if p_shift_availability is null or jsonb_typeof(p_shift_availability) <> 'object' or jsonb_object_length(p_shift_availability) <> 7 then raise exception 'Choose availability for every day.'; end if;
  if exists (select 1 from jsonb_each_text(p_shift_availability) where key <> all(v_days) or value not in ('Open','Close','Both','Unavailable')) then raise exception 'Invalid shift availability'; end if;
  if not coalesce(p_available_days, '{}') <@ v_days then raise exception 'Invalid available day'; end if;
  if exists (select 1 from unnest(v_days) day_name where ((p_shift_availability->>day_name) = 'Unavailable') = (day_name = any(coalesce(p_available_days, '{}')))) then raise exception 'Available days do not match shift availability.'; end if;
  select e.id into v_employee_id from public.employees e where e.active and e.employee_code_hash = encode(digest(p_employee_code, 'sha256'), 'hex');
  if v_employee_id is null then raise exception 'Invalid employee code'; end if;
  if exists (select 1 from public.availability_submissions where employee_id = v_employee_id and week_start = p_week_start) then
    raise exception 'You have already submitted availability for this week.';
  end if;
  insert into public.availability_submissions (employee_id, week_start, available_days, shift_availability, submitted_at, status, reviewed_at, action_at, manager_notes)
  values (v_employee_id, p_week_start, coalesce(p_available_days, '{}'), coalesce(p_shift_availability, '{}'::jsonb), now(), 'pending', null, null, '')
  returning id into v_submission_id;
  return v_submission_id;
exception when unique_violation then
  raise exception 'You have already submitted availability for this week.';
end;
$$;

drop function if exists public.manager_upsert_employee(text, text, text, text, boolean);
drop function if exists public.manager_upsert_employee(text, text, text, boolean);
drop function if exists public.manager_upsert_employee(text, text, text, boolean, boolean);
drop function if exists public.manager_upsert_employee(text, text, text, boolean, boolean, text);
drop function if exists public.manager_upsert_employee(text, text, text, boolean, boolean, text, text);
drop function if exists public.manager_deactivate_employee(text);
drop function if exists public.manager_reset_employee_calendar_token(text);
drop function if exists public.manager_list_availability_submissions(text, text);
drop function if exists public.manager_update_availability_submission(text, uuid, text[], text);
drop function if exists public.manager_key_is_valid(text);
drop function if exists public.manager_list_availability_submissions(text);
drop function if exists public.manager_update_availability_submission(uuid, text[], text);
drop function if exists public.manager_update_availability_submission(uuid, text[], text, text);
drop function if exists public.manager_update_availability_submission(uuid, text[], jsonb, text, text);
drop function if exists public.manager_delete_availability_submission(uuid);

create or replace function public.manager_upsert_employee(p_local_worker_id text, p_name text, p_employee_code text, p_active boolean, p_no_hour_limits boolean, p_mobile_phone text default '', p_calendar_token text default '')
returns table(local_worker_id text, calendar_token text) language plpgsql security definer set search_path = public, extensions
as $$
declare v_token text; v_return_local_worker_id text; v_return_calendar_token text;
begin
  if p_employee_code !~ '^\d{4}$' then raise exception 'Employee code must contain 4 digits'; end if;
  v_token := nullif(trim(coalesce(p_calendar_token, '')), '');
  if v_token is null then loop v_token := public.generate_employee_calendar_token(); exit when not exists (select 1 from public.employees e where e.calendar_token = v_token); end loop; end if;
  insert into public.employees (local_worker_id, name, employee_code_hash, active, no_hour_limits, mobile_phone, calendar_token, calendar_token_created_at, calendar_token_revoked_at, deleted_at, updated_at)
  values (p_local_worker_id, p_name, encode(digest(p_employee_code, 'sha256'), 'hex'), p_active, coalesce(p_no_hour_limits, false), left(coalesce(p_mobile_phone, ''), 40), v_token, now(), null, case when p_active then null else now() end, now())
  on conflict on constraint employees_local_worker_id_key do update set name = excluded.name, employee_code_hash = excluded.employee_code_hash, active = excluded.active, no_hour_limits = excluded.no_hour_limits, mobile_phone = excluded.mobile_phone, calendar_token = coalesce(nullif(public.employees.calendar_token, ''), excluded.calendar_token), calendar_token_created_at = coalesce(public.employees.calendar_token_created_at, now()), calendar_token_revoked_at = case when excluded.active then null else coalesce(public.employees.calendar_token_revoked_at, now()) end, deleted_at = case when excluded.active then null else coalesce(public.employees.deleted_at, now()) end, updated_at = now();
  select e.local_worker_id, e.calendar_token
    into v_return_local_worker_id, v_return_calendar_token
    from public.employees e
    where e.local_worker_id = p_local_worker_id;
  local_worker_id := v_return_local_worker_id;
  calendar_token := v_return_calendar_token;
  return next;
end;
$$;

create or replace function public.manager_reset_employee_calendar_token(p_local_worker_id text)
returns table(calendar_token text) language plpgsql security definer set search_path = public
as $$
declare v_token text;
begin
  if not exists (select 1 from public.employees e where e.local_worker_id = p_local_worker_id and e.active and e.deleted_at is null) then raise exception 'Active employee was not found in Supabase.'; end if;
  loop
    v_token := public.generate_employee_calendar_token();
    update public.employees e set calendar_token = v_token, calendar_token_created_at = now(), calendar_token_revoked_at = null, updated_at = now()
    where e.local_worker_id = p_local_worker_id and e.active and e.deleted_at is null and not exists (select 1 from public.employees other where other.calendar_token = v_token);
    exit when found;
  end loop;
  calendar_token := v_token;
  return next;
end;
$$;

create or replace function public.manager_deactivate_employee(p_local_worker_id text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if nullif(trim(coalesce(p_local_worker_id, '')), '') is null then raise exception 'Employee id is required.'; end if;
  update public.employees e set active = false, deleted_at = coalesce(e.deleted_at, now()), calendar_token_revoked_at = coalesce(e.calendar_token_revoked_at, now()), updated_at = now()
  where e.local_worker_id = p_local_worker_id;
  if not found then raise exception 'Employee was not found in Supabase.'; end if;
end;
$$;

create or replace function public.manager_list_availability_submissions(p_status text default null)
returns table (id uuid, employee_id uuid, local_worker_id text, employee_name text, week_start date, available_days text[], shift_availability jsonb, submitted_at timestamptz, status text, action_at timestamptz, manager_notes text)
language plpgsql security definer set search_path = public
as $$
begin
  return query select s.id, s.employee_id, e.local_worker_id, e.name, s.week_start, s.available_days, s.shift_availability, s.submitted_at, s.status, s.action_at, s.manager_notes
    from public.availability_submissions s join public.employees e on e.id = s.employee_id
    where p_status is null or s.status = p_status order by s.submitted_at desc;
end;
$$;

create or replace function public.manager_update_availability_submission(p_submission_id uuid, p_available_days text[], p_shift_availability jsonb, p_status text, p_manager_notes text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_days text[] := array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
begin
  if p_status not in ('pending', 'reviewed', 'applied', 'rejected') then raise exception 'Invalid status'; end if;
  if p_shift_availability is null or jsonb_typeof(p_shift_availability) <> 'object' or jsonb_object_length(p_shift_availability) <> 7 then raise exception 'Choose availability for every day.'; end if;
  if exists (select 1 from jsonb_each_text(p_shift_availability) where key <> all(v_days) or value not in ('Open','Close','Both','Unavailable')) then raise exception 'Invalid shift availability'; end if;
  if not coalesce(p_available_days, '{}') <@ v_days then raise exception 'Invalid available day'; end if;
  if exists (select 1 from unnest(v_days) day_name where ((p_shift_availability->>day_name) = 'Unavailable') = (day_name = any(coalesce(p_available_days, '{}')))) then raise exception 'Available days do not match shift availability.'; end if;
  update public.availability_submissions set available_days = coalesce(p_available_days, '{}'), shift_availability = coalesce(p_shift_availability, '{}'::jsonb), status = p_status,
    manager_notes = left(coalesce(p_manager_notes, ''), 1000),
    reviewed_at = case when p_status = 'pending' then null else now() end,
    action_at = case when p_status = 'pending' then null else now() end where id = p_submission_id;
  if not found then raise exception 'Submission not found'; end if;
end;
$$;

create or replace function public.manager_delete_availability_submission(p_submission_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  delete from public.availability_submissions where id = p_submission_id and status <> 'pending';
  if not found then raise exception 'Only history records can be permanently deleted.'; end if;
end;
$$;

revoke all on function public.employee_phone_lookup(text) from public;
revoke all on function public.generate_employee_calendar_token() from public;
revoke all on function public.submit_employee_availability(text, date, text[], jsonb) from public;
revoke all on function public.manager_upsert_employee(text, text, text, boolean, boolean, text, text) from public;
revoke all on function public.manager_deactivate_employee(text) from public;
revoke all on function public.manager_reset_employee_calendar_token(text) from public;
revoke all on function public.manager_list_availability_submissions(text) from public;
revoke all on function public.manager_update_availability_submission(uuid, text[], jsonb, text, text) from public;
revoke all on function public.manager_delete_availability_submission(uuid) from public;
grant execute on function public.employee_phone_lookup(text) to anon;
grant execute on function public.submit_employee_availability(text, date, text[], jsonb) to anon;
grant execute on function public.manager_upsert_employee(text, text, text, boolean, boolean, text, text) to anon;
grant execute on function public.manager_deactivate_employee(text) to anon;
grant execute on function public.manager_reset_employee_calendar_token(text) to anon;
grant execute on function public.manager_list_availability_submissions(text) to anon;
grant execute on function public.manager_update_availability_submission(uuid, text[], jsonb, text, text) to anon;
grant execute on function public.manager_delete_availability_submission(uuid) to anon;
