alter table public.employees add column if not exists mobile_phone text not null default '';

create table if not exists public.availability_reminder_log (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  employee_name text not null,
  phone_number text not null,
  week_start date not null,
  reminder_type text not null check (reminder_type in ('first', 'final', 'test')),
  sent_at timestamptz not null default now(),
  status text not null check (status in ('sent', 'skipped', 'failed')),
  twilio_message_sid text,
  error_message text not null default '',
  unique (employee_id, week_start, reminder_type)
);

create index if not exists availability_reminder_log_week_type_idx on public.availability_reminder_log (week_start, reminder_type);

alter table public.availability_reminder_log enable row level security;
revoke all on public.availability_reminder_log from anon, authenticated;

drop function if exists public.manager_upsert_employee(text, text, text, boolean, boolean);
drop function if exists public.manager_upsert_employee(text, text, text, boolean, boolean, text);

create function public.manager_upsert_employee(p_local_worker_id text, p_name text, p_employee_code text, p_active boolean, p_no_hour_limits boolean, p_mobile_phone text default '')
returns uuid language plpgsql security definer set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if p_employee_code !~ '^\d{4}$' then raise exception 'Employee code must contain 4 digits'; end if;
  insert into public.employees (local_worker_id, name, employee_code_hash, active, no_hour_limits, mobile_phone, updated_at)
  values (p_local_worker_id, p_name, encode(digest(p_employee_code, 'sha256'), 'hex'), p_active, coalesce(p_no_hour_limits, false), left(coalesce(p_mobile_phone, ''), 40), now())
  on conflict (local_worker_id) do update set name = excluded.name, employee_code_hash = excluded.employee_code_hash, active = excluded.active, no_hour_limits = excluded.no_hour_limits, mobile_phone = excluded.mobile_phone, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.manager_upsert_employee(text, text, text, boolean, boolean, text) from public;
grant execute on function public.manager_upsert_employee(text, text, text, boolean, boolean, text) to anon;
