-- Update employee availability submissions to accept only the following Monday-start week.
-- This replaces the previous next-four-Sundays validation without deleting existing submissions.

create or replace function public.submit_employee_availability(
  p_employee_code text,
  p_week_start date,
  p_available_days text[],
  p_shift_availability jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_employee_id uuid;
  v_workspace_id uuid;
  v_submission_id uuid;
  v_current_dow integer;
  v_next_monday date;
  v_days text[] := array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
begin
  if p_employee_code !~ '^\d{4}$' then
    raise exception 'Invalid employee code';
  end if;

  v_current_dow := extract(dow from current_date)::integer;
  v_next_monday := current_date + case when v_current_dow = 0 then 1 else 8 - v_current_dow end;

  if p_week_start is null or p_week_start <> v_next_monday then
    raise exception 'Availability can only be submitted for next week.';
  end if;

  if p_shift_availability is null or jsonb_typeof(p_shift_availability) <> 'object' or jsonb_object_length(p_shift_availability) <> 7 then
    raise exception 'Choose availability for every day.';
  end if;

  if exists (
    select 1
    from jsonb_each_text(p_shift_availability)
    where key <> all(v_days)
      or value not in ('Open','Close','Both','Unavailable')
  ) then
    raise exception 'Invalid shift availability';
  end if;

  if not coalesce(p_available_days, '{}') <@ v_days then
    raise exception 'Invalid available day';
  end if;

  if exists (
    select 1
    from unnest(v_days) day_name
    where ((p_shift_availability->>day_name) = 'Unavailable') = (day_name = any(coalesce(p_available_days, '{}')))
  ) then
    raise exception 'Available days do not match shift availability.';
  end if;

  select e.id, e.workspace_id
  into v_employee_id, v_workspace_id
  from public.employees e
  where e.active
    and e.employee_code_hash = encode(digest(p_employee_code, 'sha256'), 'hex')
  limit 1;

  if v_employee_id is null then
    raise exception 'Invalid employee code';
  end if;

  if exists (
    select 1
    from public.availability_submissions s
    where s.employee_id = v_employee_id
      and s.week_start = p_week_start
  ) then
    raise exception 'You have already submitted availability for this week.';
  end if;

  insert into public.availability_submissions (
    employee_id,
    workspace_id,
    week_start,
    available_days,
    shift_availability,
    submitted_at,
    status,
    reviewed_at,
    action_at,
    manager_notes
  )
  values (
    v_employee_id,
    v_workspace_id,
    p_week_start,
    coalesce(p_available_days, '{}'),
    p_shift_availability,
    now(),
    'pending',
    null,
    null,
    ''
  )
  returning id into v_submission_id;

  return v_submission_id;
exception
  when unique_violation then
    raise exception 'You have already submitted availability for this week.';
end;
$$;

revoke all on function public.submit_employee_availability(text, date, text[], jsonb) from public;
grant execute on function public.submit_employee_availability(text, date, text[], jsonb) to anon;

notify pgrst, 'reload schema';
