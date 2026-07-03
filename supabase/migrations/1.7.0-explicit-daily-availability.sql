update public.availability_submissions s
set shift_availability = jsonb_build_object(
  'Monday', case when 'Monday' = any(s.available_days) then coalesce(s.shift_availability->>'Monday', 'Both') else 'Unavailable' end,
  'Tuesday', case when 'Tuesday' = any(s.available_days) then coalesce(s.shift_availability->>'Tuesday', 'Both') else 'Unavailable' end,
  'Wednesday', case when 'Wednesday' = any(s.available_days) then coalesce(s.shift_availability->>'Wednesday', 'Both') else 'Unavailable' end,
  'Thursday', case when 'Thursday' = any(s.available_days) then coalesce(s.shift_availability->>'Thursday', 'Both') else 'Unavailable' end,
  'Friday', case when 'Friday' = any(s.available_days) then coalesce(s.shift_availability->>'Friday', 'Both') else 'Unavailable' end,
  'Saturday', case when 'Saturday' = any(s.available_days) then coalesce(s.shift_availability->>'Saturday', 'Both') else 'Unavailable' end,
  'Sunday', case when 'Sunday' = any(s.available_days) then coalesce(s.shift_availability->>'Sunday', 'Both') else 'Unavailable' end
);

drop function if exists public.submit_employee_availability(text, date, text[], jsonb);
drop function if exists public.manager_update_availability_submission(uuid, text[], jsonb, text, text);

create function public.submit_employee_availability(p_employee_code text, p_week_start date, p_available_days text[], p_shift_availability jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions
as $$
declare v_employee_id uuid; v_submission_id uuid; v_first_sunday date; v_days text[] := array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
begin
  if p_employee_code !~ '^\d{4}$' then raise exception 'Invalid employee code'; end if;
  v_first_sunday := current_date + ((7 - extract(dow from current_date)::integer) % 7);
  if p_week_start is null or extract(dow from p_week_start) <> 0 then raise exception 'Please select a Sunday week from the available list.'; end if;
  if p_week_start < v_first_sunday or p_week_start > v_first_sunday + 21 then raise exception 'Availability can only be submitted for one of the next four Sundays.'; end if;
  if p_shift_availability is null or jsonb_typeof(p_shift_availability) <> 'object' or jsonb_object_length(p_shift_availability) <> 7 then raise exception 'Choose availability for every day.'; end if;
  if exists (select 1 from jsonb_each_text(p_shift_availability) where key <> all(v_days) or value not in ('Open','Close','Both','Unavailable')) then raise exception 'Invalid shift availability'; end if;
  if not coalesce(p_available_days, '{}') <@ v_days then raise exception 'Invalid available day'; end if;
  if exists (select 1 from unnest(v_days) day_name where ((p_shift_availability->>day_name) = 'Unavailable') = (day_name = any(coalesce(p_available_days, '{}')))) then raise exception 'Available days do not match shift availability.'; end if;
  select e.id into v_employee_id from public.employees e where e.active and e.employee_code_hash = encode(digest(p_employee_code, 'sha256'), 'hex');
  if v_employee_id is null then raise exception 'Invalid employee code'; end if;
  if exists (select 1 from public.availability_submissions where employee_id = v_employee_id and week_start = p_week_start) then raise exception 'You have already submitted availability for this week.'; end if;
  insert into public.availability_submissions (employee_id, week_start, available_days, shift_availability, submitted_at, status, reviewed_at, action_at, manager_notes)
  values (v_employee_id, p_week_start, coalesce(p_available_days, '{}'), p_shift_availability, now(), 'pending', null, null, '')
  returning id into v_submission_id;
  return v_submission_id;
exception when unique_violation then raise exception 'You have already submitted availability for this week.';
end;
$$;

create function public.manager_update_availability_submission(p_submission_id uuid, p_available_days text[], p_shift_availability jsonb, p_status text, p_manager_notes text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_days text[] := array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
begin
  if p_status not in ('pending','reviewed','applied','rejected') then raise exception 'Invalid status'; end if;
  if p_shift_availability is null or jsonb_typeof(p_shift_availability) <> 'object' or jsonb_object_length(p_shift_availability) <> 7 then raise exception 'Choose availability for every day.'; end if;
  if exists (select 1 from jsonb_each_text(p_shift_availability) where key <> all(v_days) or value not in ('Open','Close','Both','Unavailable')) then raise exception 'Invalid shift availability'; end if;
  if not coalesce(p_available_days, '{}') <@ v_days then raise exception 'Invalid available day'; end if;
  if exists (select 1 from unnest(v_days) day_name where ((p_shift_availability->>day_name) = 'Unavailable') = (day_name = any(coalesce(p_available_days, '{}')))) then raise exception 'Available days do not match shift availability.'; end if;
  update public.availability_submissions set available_days = coalesce(p_available_days, '{}'), shift_availability = p_shift_availability, status = p_status,
    manager_notes = left(coalesce(p_manager_notes, ''), 1000), reviewed_at = case when p_status = 'pending' then null else now() end,
    action_at = case when p_status = 'pending' then null else now() end where id = p_submission_id;
  if not found then raise exception 'Submission not found'; end if;
end;
$$;

revoke all on function public.submit_employee_availability(text, date, text[], jsonb) from public;
revoke all on function public.manager_update_availability_submission(uuid, text[], jsonb, text, text) from public;
grant execute on function public.submit_employee_availability(text, date, text[], jsonb) to anon;
grant execute on function public.manager_update_availability_submission(uuid, text[], jsonb, text, text) to anon;
notify pgrst, 'reload schema';
