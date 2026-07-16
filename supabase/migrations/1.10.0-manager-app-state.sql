create table if not exists public.manager_app_state (
  id text primary key,
  state_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.manager_app_state enable row level security;
revoke all on public.manager_app_state from anon, authenticated;

create or replace function public.manager_load_app_state(p_id text default 'habaneros-manager')
returns table (state_data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select s.state_data, s.updated_at
  from public.manager_app_state s
  where s.id = p_id
  limit 1;
$$;

create or replace function public.manager_save_app_state(p_id text, p_state_data jsonb)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare v_updated_at timestamptz;
begin
  if p_id is null or length(trim(p_id)) = 0 then
    raise exception 'Manager app state id is required.';
  end if;

  if p_state_data is null or jsonb_typeof(p_state_data) <> 'object' then
    raise exception 'Manager app state must be a JSON object.';
  end if;

  insert into public.manager_app_state (id, state_data, updated_at)
  values (p_id, p_state_data, now())
  on conflict (id) do update set state_data = excluded.state_data, updated_at = now()
  returning updated_at into v_updated_at;

  return v_updated_at;
end;
$$;

revoke all on function public.manager_load_app_state(text) from public;
revoke all on function public.manager_save_app_state(text, jsonb) from public;
grant execute on function public.manager_load_app_state(text) to anon;
grant execute on function public.manager_save_app_state(text, jsonb) to anon;
