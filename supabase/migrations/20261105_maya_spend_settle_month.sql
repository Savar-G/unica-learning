-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration maya_spend_settle_month, 2026-11-05 (Management API).
-- Maya's spending ledger (D-290, docs/maya-spend.md), review 3 of PR #640: a settle answers the month the reservation is
-- in, so the team's monthly alert checks that month's total, also when the cost comes back after midnight on the 1st.
-- Additive: one new function with the same rules as settle_maya_spend (the first settle stays; null keeps the
-- reservation counted), which stays for code that still calls it.
create function public.settle_maya_spend_month(p_id uuid, p_cost bigint)
returns date language plpgsql security definer set search_path = '' as $$
declare v_month date;
begin
  if p_id is null or (p_cost is not null and p_cost not between 0 and 100000000) then
    raise exception 'maya_spend_invalid' using errcode = '22023';
  end if;
  update public.maya_spend set cost_micros = p_cost, uncertain = (p_cost is null), settled_at = now()
    where id = p_id and settled_at is null
    returning month into v_month;
  return v_month;
end $$;
revoke all on function public.settle_maya_spend_month(uuid, bigint) from public, anon, authenticated;
grant execute on function public.settle_maya_spend_month(uuid, bigint) to service_role;
