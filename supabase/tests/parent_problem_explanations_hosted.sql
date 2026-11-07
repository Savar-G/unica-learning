-- #675. Read-only hosted probes for the root. Run after the migration and before paid proof calls.
-- These queries return no family content or credentials. They do not prove live route or provider behavior.
select to_regprocedure('public.parent_explanation_command(text,uuid,uuid,uuid,jsonb)') as installed_rpc;
select role,has_function_privilege(role,'public.parent_explanation_command(text,uuid,uuid,uuid,jsonb)','EXECUTE') as can_execute
from (values('anon'),('authenticated'),('service_role')) r(role);
-- Expected: service_role only. No direct mutation grant for any of these three roles.
select c.relname,c.relrowsecurity,r.role,
  has_table_privilege(r.role,c.oid,'SELECT') as can_select,
  has_table_privilege(r.role,c.oid,'INSERT') as can_insert,
  has_table_privilege(r.role,c.oid,'UPDATE') as can_update,
  has_table_privilege(r.role,c.oid,'DELETE') as can_delete
from pg_class c cross join (values('anon'),('authenticated'),('service_role')) r(role)
where c.oid in ('public.parent_explanation_prices'::regclass,'public.parent_explanations'::regclass,
  'public.parent_explanation_spend'::regclass,'public.parent_explanation_dispatches'::regclass)
order by c.relname,r.role;
-- Initial migration: disabled, no maximum and no verification. Root must verify and configure before paid proof.
select model,protocol,max_input_bytes,max_tokens,maximum_micros,verified_at,enabled,
  verified_at<=clock_timestamp() and verified_at>clock_timestamp()-interval '24 hours' as fresh
from public.parent_explanation_prices;
-- Anonymous totals only. Every unknown charge uses the full hold. Overrun blocks all periods.
select period,count(*) as attempts,sum(reserved_micros) as reserved_micros,
  sum(coalesce(charged_micros,reserved_micros)) as held_or_charged_micros,
  count(*) filter(where charged_micros is null) as unknown_charges,
  count(*) filter(where charged_micros>reserved_micros) as overruns
from public.parent_explanation_spend group by period order by period;
select tgrelid::regclass as owned_table,tgname from pg_trigger
where not tgisinternal and tgrelid in ('public.parent_explanations'::regclass,'public.parent_explanation_dispatches'::regclass)
order by owned_table,tgname;
