create extension if not exists pgcrypto with schema extensions;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  local_worker_id text not null unique,
  name text not null check (char_length(name) between 1 and 120),
  employee_code_hash text not null unique,
  active boolean not null default true,
  no_hour_limits boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employees add column if not exists no_hour_limits boolean not null default false;

create table if not exists public.availability_submissions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  week_start date not null,
  available_days text[] not null default '{}',
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

alter table public.employees enable row level security;
alter table public.availability_submissions enable row level security;

-- No table policies are created. Anonymous clients can only use the limited functions below.
revoke all on public.employees from anon, authenticated;
revoke all on public.availability_submissions from anon, authenticated;

create or replace function public.employee_phone_lookup(p_employee_code text)
returns table (employee_name text)
language sql stable security definer set search_path = public, extensions
as $$
  select e.name from public.employees e
  where e.active and e.employee_code_hash = encode(digest(p_employee_code, 'sha256'), 'hex')
    and p_employee_code ~ '^\d{4}$'
  limit 1;
$$;

create or replace function public.submit_employee_availability(p_employee_code text, p_week_start date, p_available_days text[])
returns uuid language plpgsql security definer set search_path = public, extensions
as $$
declare v_employee_id uuid; v_submission_id uuid; v_first_sunday date;
begin
  if p_employee_code !~ '^\d{4}$' then raise exception 'Invalid employee code'; end if;
  v_first_sunday := current_date + ((7 - extract(dow from current_date)::integer) % 7);
  if p_week_start is null or extract(dow from p_week_start) <> 0 then raise exception 'Please select a Sunday week from the available list.'; end if;
  if p_week_start < v_first_sunday or p_week_start > v_first_sunday + 21 then raise exception 'Availability can only be submitted for one of the next four Sundays.'; end if;
  if not coalesce(p_available_days, '{}') <@ array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::text[] then raise exception 'Invalid available day'; end if;
  select e.id into v_employee_id from public.employees e where e.active and e.employee_code_hash = encode(digest(p_employee_code, 'sha256'), 'hex');
  if v_employee_id is null then raise exception 'Invalid employee code'; end if;
  if exists (select 1 from public.availability_submissions where employee_id = v_employee_id and week_start = p_week_start) then
    raise exception 'You have already submitted availability for this week.';
  end if;
  insert into public.availability_submissions (employee_id, week_start, available_days, submitted_at, status, reviewed_at, action_at, manager_notes)
  values (v_employee_id, p_week_start, coalesce(p_available_days, '{}'), now(), 'pending', null, null, '')
  returning id into v_submission_id;
  return v_submission_id;
exception when unique_violation then
  raise exception 'You have already submitted availability for this week.';
end;
$$;

drop function if exists public.manager_upsert_employee(text, text, text, text, boolean);
drop function if exists public.manager_upsert_employee(text, text, text, boolean);
drop function if exists public.manager_upsert_employee(text, text, text, boolean, boolean);
drop function if exists public.manager_list_availability_submissions(text, text);
drop function if exists public.manager_update_availability_submission(text, uuid, text[], text);
drop function if exists public.manager_key_is_valid(text);
drop function if exists public.manager_list_availability_submissions(text);
drop function if exists public.manager_update_availability_submission(uuid, text[], text);
drop function if exists public.manager_update_availability_submission(uuid, text[], text, text);
drop function if exists public.manager_delete_availability_submission(uuid);

create or replace function public.manager_upsert_employee(p_local_worker_id text, p_name text, p_employee_code text, p_active boolean, p_no_hour_limits boolean)
returns uuid language plpgsql security definer set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if p_employee_code !~ '^\d{4}$' then raise exception 'Employee code must contain 4 digits'; end if;
  insert into public.employees (local_worker_id, name, employee_code_hash, active, no_hour_limits, updated_at)
  values (p_local_worker_id, p_name, encode(digest(p_employee_code, 'sha256'), 'hex'), p_active, coalesce(p_no_hour_limits, false), now())
  on conflict (local_worker_id) do update set name = excluded.name, employee_code_hash = excluded.employee_code_hash, active = excluded.active, no_hour_limits = excluded.no_hour_limits, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.manager_list_availability_submissions(p_status text default null)
returns table (id uuid, employee_id uuid, local_worker_id text, employee_name text, week_start date, available_days text[], submitted_at timestamptz, status text, action_at timestamptz, manager_notes text)
language plpgsql security definer set search_path = public
as $$
begin
  return query select s.id, s.employee_id, e.local_worker_id, e.name, s.week_start, s.available_days, s.submitted_at, s.status, s.action_at, s.manager_notes
    from public.availability_submissions s join public.employees e on e.id = s.employee_id
    where p_status is null or s.status = p_status order by s.submitted_at desc;
end;
$$;

create or replace function public.manager_update_availability_submission(p_submission_id uuid, p_available_days text[], p_status text, p_manager_notes text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if p_status not in ('pending', 'reviewed', 'applied', 'rejected') then raise exception 'Invalid status'; end if;
  if not coalesce(p_available_days, '{}') <@ array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::text[] then raise exception 'Invalid available day'; end if;
  update public.availability_submissions set available_days = coalesce(p_available_days, '{}'), status = p_status,
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
revoke all on function public.submit_employee_availability(text, date, text[]) from public;
revoke all on function public.manager_upsert_employee(text, text, text, boolean, boolean) from public;
revoke all on function public.manager_list_availability_submissions(text) from public;
revoke all on function public.manager_update_availability_submission(uuid, text[], text, text) from public;
revoke all on function public.manager_delete_availability_submission(uuid) from public;
grant execute on function public.employee_phone_lookup(text) to anon;
grant execute on function public.submit_employee_availability(text, date, text[]) to anon;
grant execute on function public.manager_upsert_employee(text, text, text, boolean, boolean) to anon;
grant execute on function public.manager_list_availability_submissions(text) to anon;
grant execute on function public.manager_update_availability_submission(uuid, text[], text, text) to anon;
grant execute on function public.manager_delete_availability_submission(uuid) to anon;
