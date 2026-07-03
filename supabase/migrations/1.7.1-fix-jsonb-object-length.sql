create or replace function public.jsonb_object_length(input jsonb)
returns integer
language sql
immutable
strict
as $$
  select count(*)::integer
  from jsonb_object_keys(input);
$$;