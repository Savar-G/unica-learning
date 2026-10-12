-- #82 public launch. Additive: one new function, no table change. Apply after 20261011225238_add_family_deletion_worker_lease.sql.
-- /api/account/finish calls it with the secret key, after the parent proved their email (email code or Google).
-- It writes the parent row and the first child in one transaction, under the site-wide cap of 20 new families in
-- 10 minutes. The advisory lock makes callers take turns, so parallel requests cannot all see a count under the cap,
-- and a failed child insert rolls the parent row back (no half family to clean up).
-- Answers: {"status":"created","child":<uuid>} | {"status":"exists"} | {"status":"busy"} | {"status":"unavailable"}.
-- "unavailable": a deletion (#78) is recorded for this user. A session that is still valid cannot make the family again
-- between the parent row delete and the Auth delete.
create function public.create_family(
  p_parent uuid,
  p_name text,
  p_email text,
  p_postal text,
  p_source jsonb,
  p_child_name text,
  p_child_grade smallint,
  p_child_province text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  new_child uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('public.create_family', 0));
  if exists (select 1 from public.parents where id = p_parent) then
    return jsonb_build_object('status', 'exists');
  end if;
  if exists (select 1 from public.family_deletions where parent_id = p_parent) then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if (select count(*) from public.parents where created_at > now() - interval '10 minutes') >= 20 then
    return jsonb_build_object('status', 'busy');
  end if;
  insert into public.parents (id, name, email, postal, source)
    values (p_parent, p_name, p_email, p_postal, coalesce(p_source, '{}'::jsonb));
  insert into public.children (parent_id, first_name, grade, province)
    values (p_parent, p_child_name, p_child_grade, p_child_province)
    returning id into new_child;
  return jsonb_build_object('status', 'created', 'child', new_child);
end $$;

revoke all on function public.create_family(uuid, text, text, text, jsonb, text, smallint, text) from public, anon, authenticated;
grant execute on function public.create_family(uuid, text, text, text, jsonb, text, smallint, text) to service_role;
