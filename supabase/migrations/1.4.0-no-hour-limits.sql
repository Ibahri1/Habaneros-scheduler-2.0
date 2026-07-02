alter table public.employees add column if not exists no_hour_limits boolean not null default false;

drop function if exists public.manager_upsert_employee(text, text, text, boolean);
drop function if exists public.manager_upsert_employee(text, text, text, boolean, boolean);

create function public.manager_upsert_employee(p_local_worker_id text, p_name text, p_employee_code text, p_active boolean, p_no_hour_limits boolean)
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

revoke all on function public.manager_upsert_employee(text, text, text, boolean, boolean) from public;
grant execute on function public.manager_upsert_employee(text, text, text, boolean, boolean) to anon;
notify pgrst, 'reload schema';
