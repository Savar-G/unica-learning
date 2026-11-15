-- Cost per child per month (docs/child-unit-cost.md, /admin/ai/children): two admin-only reads.
--
-- admin_child_unit_cost_families: every family with a child, its zone inputs (time zone, postal, each child's province and
-- created_at, so the site's own rule in src/lib/family-time.ts picks the family's zone), whether it is a test or admin family,
-- and each child's stored plan state.
--
-- admin_child_unit_cost: the page sends each family's own month as [from, to) by that zone. The function sums, per family
-- and child inside those bounds: the AI cost in US dollars (the new ledger plus the older workbook ledger, with the same
-- "the new ledger wins" rule as admin_ai_usage), the older Maya model rows and the speech and voice estimates in CAD micros
-- (maya_spend), the subscription calls (no per-call cost), the paid calls with no cost, and the workbooks shipped. It also
-- sums the budget tracker's printing and postage expenses of the calendar month p_month. Money is not rounded here: the
-- page rounds each total once.
create or replace function public.admin_child_unit_cost_families()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'admin only' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'parent_id', p.id, 'name', p.name, 'email', p.email, 'time_zone', p.time_zone, 'postal', p.postal,
      'is_test', p.id in (select t.parent_id from public.test_accounts t union select a.user_id from public.admin_users a),
      'children', (
        select jsonb_agg(jsonb_build_object(
          'id', c.id, 'first_name', c.first_name, 'created_at', c.created_at, 'province', c.province,
          'plan_kind', s.kind, 'monthly_cents', s.monthly_cents, 'ends_at', s.ends_at, 'ending_free', s.ending_free
        ) order by c.created_at, c.id)
        from public.children c left join public.child_plan_states s on s.child_id = c.id
        where c.parent_id = p.id
      )
    ) order by p.created_at, p.id)
    from public.parents p
    where exists (select 1 from public.children c where c.parent_id = p.id)
  ), '[]'::jsonb);
end $$;
revoke all on function public.admin_child_unit_cost_families() from public, anon;
grant execute on function public.admin_child_unit_cost_families() to authenticated, service_role;

create or replace function public.admin_child_unit_cost(p_bounds jsonb, p_month text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare lo timestamptz; hi timestamptz; bad boolean; result jsonb;
begin
  if not (select public.is_admin()) then raise exception 'admin only' using errcode = '42501'; end if;
  if p_bounds is null or jsonb_typeof(p_bounds) <> 'array' or jsonb_array_length(p_bounds) > 20000 then raise exception 'bad bounds'; end if;
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'bad month'; end if;
  select min((x->>'from')::timestamptz), max((x->>'to')::timestamptz),
    bool_or((x->>'to')::timestamptz <= (x->>'from')::timestamptz or (x->>'to')::timestamptz - (x->>'from')::timestamptz > interval '32 days')
    into lo, hi, bad from jsonb_array_elements(p_bounds) x;
  if bad then raise exception 'bad bounds'; end if;
  if lo is null then return jsonb_build_object('sums', '[]'::jsonb, 'budget', '[]'::jsonb); end if;

  with b as (
    select distinct on ((x->>'parent_id')::uuid) (x->>'parent_id')::uuid as parent_id, (x->>'from')::timestamptz as f, (x->>'to')::timestamptz as t
    from jsonb_array_elements(p_bounds) x
  ),
  seen as (
    select distinct e.source_kind, e.source_id, e.feature from public.ai_usage_events e
    where e.source_id is not null and e.created_at >= lo - interval '2 days' and e.created_at < hi + interval '2 days'
  ),
  -- One row for each counted thing, tagged; the sums below group them by family and child.
  r as (
    select e.parent_id, e.child_id, e.provider, e.cost_usd, e.calls, null::text as what, null::bigint as micros, 0 as shipped
    from public.ai_usage_events e join b on b.parent_id = e.parent_id and e.created_at >= b.f and e.created_at < b.t
    union all
    select c.parent_id, c.child_id, case when c.provider = 'subscription' then 'subscription' else 'openrouter' end,
      c.usd::numeric, greatest(coalesce(c.requests, 1), 1), null, null, 0
    from public.workbook_run_ai_calls c join b on b.parent_id = c.parent_id and c.created_at >= b.f and c.created_at < b.t
    where not exists (select 1 from seen s where s.source_kind = 'workbook_run' and s.source_id = c.run_id::text
      and s.feature = case when c.kind = 'solve' then 'solve_check' else 'workbook' end)
    union all
    select m.parent_id, m.child_id, null, null, 0, m.what, m.cost_micros, 0
    from public.maya_spend m join b on b.parent_id = m.parent_id and m.created_at >= b.f and m.created_at < b.t
    where m.cost_micros is not null
      and (m.what in ('speech_to_text', 'voice')
        or m.call_id is null
        or not exists (select 1 from seen s where s.source_kind = 'maya_call' and s.source_id = m.call_id::text))
    union all
    select w.parent_id, w.child_id, null, null, 0, null, null, 1
    from public.workbooks w join b on b.parent_id = w.parent_id and w.shipped_at >= b.f and w.shipped_at < b.t
  ),
  sums as (
    select parent_id, child_id,
      coalesce(sum(cost_usd) filter (where provider is not null and provider <> 'subscription'), 0) as ai_usd,
      coalesce(sum(calls), 0) as calls,
      coalesce(sum(calls) filter (where provider = 'subscription'), 0) as subscription_calls,
      coalesce(sum(calls) filter (where provider is not null and provider <> 'subscription' and cost_usd is null), 0) as unpriced_calls,
      coalesce(sum(micros) filter (where what is not null and what not in ('speech_to_text', 'voice')), 0) as maya_model_micros,
      coalesce(sum(micros) filter (where what = 'speech_to_text'), 0) as speech_micros,
      coalesce(sum(micros) filter (where what = 'voice'), 0) as voice_micros,
      sum(shipped) as workbooks_shipped
    from r group by 1, 2
  ),
  budget as (
    select c.name, round(sum(e.amount_cad) * 100)::bigint as cents, count(*) as entries
    from public.budget_entries e join public.budget_categories c on c.id = e.category_id
    where e.deleted_at is null and e.kind = 'expense' and to_char(e.entry_date, 'YYYY-MM') = p_month
      and (lower(c.name) like '%print%' or lower(c.name) like '%postage%' or lower(c.name) like '%shipping%')
    group by 1
  )
  select jsonb_build_object(
    'sums', coalesce((select jsonb_agg(to_jsonb(s)) from sums s), '[]'),
    'budget', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from budget x), '[]')
  ) into result;
  return result;
end $$;
revoke all on function public.admin_child_unit_cost(jsonb, text) from public, anon;
grant execute on function public.admin_child_unit_cost(jsonb, text) to authenticated, service_role;
