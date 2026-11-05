-- #529. Only synthetic rows. The transaction rolls back all of them.
begin;
do $$
declare
  p uuid := gen_random_uuid(); other_p uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid'), (other_p, other_p::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values
    (p, 'Notice test', p::text || '@example.invalid', 'V3S 1A1'),
    (other_p, 'Other notice test', other_p::text || '@example.invalid', 'M5V 1A1');
  insert into public.maya_notice_acceptances(parent_id, notice_version, accepted_by) values (p, 'probe-1', p), (other_p, 'probe-1', other_p);
  -- A second version is its own row; the same version twice is refused.
  insert into public.maya_notice_acceptances(parent_id, notice_version, accepted_by) values (p, 'probe-2', p);
  begin
    insert into public.maya_notice_acceptances(parent_id, notice_version, accepted_by) values (p, 'probe-1', p);
    raise exception 'Same version saved twice';
  exception when unique_violation then null; end;

  -- A parent reads only their own rows, and writes none.
  perform set_config('request.jwt.claim.sub', p::text, true);
  set local role authenticated;
  if (select count(*) from public.maya_notice_acceptances) <> 2 then raise exception 'Owner read failed'; end if;
  if exists (select 1 from public.maya_notice_acceptances where parent_id = other_p) then raise exception 'Other family read'; end if;
  begin
    insert into public.maya_notice_acceptances(parent_id, notice_version, accepted_by) values (p, 'probe-3', p);
    raise exception 'Parent wrote an acceptance';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.maya_notice_acceptances where parent_id = p;
    raise exception 'Parent deleted an acceptance';
  exception when insufficient_privilege then null; end;
  reset role;
  if has_table_privilege('anon', 'public.maya_notice_acceptances', 'select') then raise exception 'Anonymous read'; end if;
  if has_table_privilege('service_role', 'public.maya_notice_acceptances', 'update') then raise exception 'Service can change a row'; end if;
  if has_table_privilege('service_role', 'public.maya_notice_acceptances', 'delete') then raise exception 'Service can delete a row'; end if;

  -- The family deletion deletes the Auth user: the acceptance goes with it. The other family's row stays.
  delete from auth.users where id = p;
  if exists (select 1 from public.maya_notice_acceptances where parent_id = p) then raise exception 'Acceptance survived family deletion'; end if;
  if not exists (select 1 from public.maya_notice_acceptances where parent_id = other_p) then raise exception 'Positive control failed'; end if;
  raise exception 'PROBE_RESULT ok';
end $$;
rollback;
