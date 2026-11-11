-- Required phone for new signups. Older families and the previous site version keep working.
alter table public.parents add column phone text;
alter table public.parents add constraint parents_phone_check
  check (phone is null or phone ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$');

-- Keep the eight-argument function for the previous deployment. The new overload has no default argument,
-- so PostgREST selects it only when the new signup sends p_phone. It uses the original admission lock,
-- deletion fence, family cap and inserts. A phone failure rolls the whole call back, including the child.
create function public.create_family(
  p_parent uuid,
  p_name text,
  p_email text,
  p_postal text,
  p_source jsonb,
  p_child_name text,
  p_child_grade smallint,
  p_child_province text,
  p_phone text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_phone is null or p_phone !~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$' then
    raise exception 'Invalid phone number' using errcode = '22023';
  end if;
  result := public.create_family(
    p_parent, p_name, p_email, p_postal, p_source,
    p_child_name, p_child_grade, p_child_province
  );
  if result->>'status' = 'created' then
    update public.parents set phone = p_phone where id = p_parent;
  end if;
  return result;
end $$;

revoke all on function public.create_family(uuid, text, text, text, jsonb, text, smallint, text, text)
  from public, anon, authenticated;
grant execute on function public.create_family(uuid, text, text, text, jsonb, text, smallint, text, text)
  to service_role;
