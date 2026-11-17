-- Read-only hosted preflight. Run after the parent applies the migration.
-- This probe creates no user, note, telemetry, email or product action.
begin read only;
select c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('customer_activity','customer_activity_coverage');
select role,
 has_table_privilege(role,'public.customer_activity','SELECT') direct_read,
 has_table_privilege(role,'public.customer_activity','INSERT') direct_insert,
 has_function_privilege(role,'public.record_customer_activity(uuid,uuid,uuid,uuid,text,text,uuid,text)','EXECUTE') event_write,
 has_function_privilege(role,'public.record_customer_plan_actor(uuid,integer,uuid)','EXECUTE') plan_actor_write,
 has_function_privilege(role,'public.admin_customer_history(uuid,uuid,uuid,timestamptz,timestamptz,text,text,timestamptz,text,boolean,text)','EXECUTE') history_read
from unnest(array['anon','authenticated','service_role']) role;
-- Expected: no direct read/insert; service-only event/plan write; authenticated history execute.
-- The history function itself must refuse a non-admin. Catch only that expected SQLSTATE.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000000',true);
do $$ begin
  perform public.admin_customer_history();
  raise exception 'FAIL: non-admin history read succeeded';
exception when insufficient_privilege then null;
end $$;
reset role;
rollback;
-- Actual admin output, cookie rejection/revocation, deletion fences and end-to-end UI still need separate review.
