-- Hosted verification. All synthetic rows roll back. No email or external service is called.
begin;
set local statement_timeout = '15s';
do $$
declare
  current_id uuid := gen_random_uuid();
  legacy_id uuid := gen_random_uuid();
  failed_id uuid := gen_random_uuid();
  result jsonb;
begin
  insert into auth.users (id) values (current_id), (legacy_id), (failed_id);
  result := public.create_family(current_id, 'Phone Probe', 'phone-probe@example.com', null,
    '{}'::jsonb, 'Probe', 3::smallint, 'BC', '+16045550123');
  if result->>'status' <> 'created' then raise exception 'Creation refused: %', result; end if;
  if not exists (select 1 from public.parents where id = current_id and phone = '+16045550123') then
    raise exception 'Phone not saved';
  end if;
  if not exists (select 1 from public.children where parent_id = current_id) then
    raise exception 'Child not saved';
  end if;
  result := public.create_family(current_id, 'Changed Name', 'changed@example.com', null,
    '{}'::jsonb, 'Other', 3::smallint, 'BC', '+14165550124');
  if result->>'status' <> 'exists' or not exists
    (select 1 from public.parents where id = current_id and phone = '+16045550123' and name = 'Phone Probe') then
    raise exception 'Existing family changed';
  end if;
  result := public.create_family(legacy_id, 'Legacy Probe', 'legacy-probe@example.com', null,
    '{}'::jsonb, 'Probe', 3::smallint, 'BC');
  if result->>'status' <> 'created' or not exists
    (select 1 from public.parents where id = legacy_id and phone is null) then
    raise exception 'Legacy call changed';
  end if;
  begin
    perform public.create_family(failed_id, 'Phone Probe', 'invalid-probe@example.com', null,
      '{}'::jsonb, 'Probe', 3::smallint, 'BC', null);
    raise exception 'Null phone accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_family(failed_id, 'Phone Probe', 'invalid-probe@example.com', null,
      '{}'::jsonb, 'Probe', 3::smallint, 'BC', '6045550123');
    raise exception 'Unnormalized phone accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_family(failed_id, 'Phone Probe', 'invalid-probe@example.com', null,
      '{}'::jsonb, 'Probe', -1::smallint, 'BC', '+16045550123');
    raise exception 'Invalid child accepted';
  exception when check_violation then null;
  end;
  if exists (select 1 from public.parents where id = failed_id) then
    raise exception 'Failed child insert left a parent';
  end if;
  delete from auth.users where id = current_id;
  if exists (select 1 from public.parents where id = current_id) then
    raise exception 'Family deletion kept the phone';
  end if;
end $$;
select 'PASS: atomic phone creation, unchanged legacy and existing families, invalid rejection, rollback, deletion' as result;
rollback;
