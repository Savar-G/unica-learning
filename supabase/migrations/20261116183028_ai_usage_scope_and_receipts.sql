-- Additive metadata only. Old rows remain unknown. Root applies this migration before the application ships.
alter table public.ai_usage_events
  add column receipt_id uuid,
  add column usage_context text not null default 'unknown' check (usage_context in ('production', 'practice', 'evaluation', 'test', 'unknown')),
  add column run_id uuid,
  add column key_alias text not null default 'unknown' check (key_alias in ('main', 'marking', 'explanations', 'decisions', 'local', 'anthropic', 'unknown')),
  add column key_id text check (key_id is null or key_id ~ '^[0-9a-f]{64}$'),
  add column cost_basis text not null default 'unknown' check (cost_basis in ('provider', 'estimate', 'unknown'));
create unique index ai_usage_receipt_key on public.ai_usage_events(receipt_id) where receipt_id is not null;
create index ai_usage_key_receipts_idx on public.ai_usage_events(key_id) where key_id is not null and generation_id is not null;

create or replace function public.admin_ai_usage(p_from timestamptz, p_to timestamptz, p_with_tests boolean default false, p_cad_per_usd numeric default 1.40, p_day_starts timestamptz[] default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare cut_marking timestamptz; cut_explain timestamptz; result jsonb;
begin
  if not (select public.is_admin()) then raise exception 'admin only' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'bad period';
  end if;
  if p_cad_per_usd is null or p_cad_per_usd <= 0 then p_cad_per_usd := 1.40; end if;
  if p_day_starts is not null and cardinality(p_day_starts) = 0 then raise exception 'p_day_starts is empty'; end if;
  select min(created_at) into cut_marking from public.ai_usage_events where feature = 'marking';
  select min(created_at) into cut_explain from public.ai_usage_events where feature = 'explain';

  with leftout as (
    select parent_id from public.test_accounts union select user_id from public.admin_users
  ),
  ledger as (
    select e.created_at, e.feature, e.provider, e.model, e.cost_usd, e.calls, e.parent_id, e.child_id, false as old, case when e.source_kind = 'maya_call' and exists (select 1 from public.maya_calls mc where mc.id::text = e.source_id and mc.kind = 'admin_test') then 'test' else e.usage_context end as usage_context, e.key_alias, e.key_id, e.cost_basis
    from public.ai_usage_events e where e.created_at >= p_from and e.created_at < p_to
  ),
  seen as (
    select distinct e.source_kind, e.source_id, e.feature from public.ai_usage_events e
    where e.source_id is not null and e.created_at >= p_from - interval '2 days' and e.created_at < p_to + interval '2 days'
  ),
  old_rows as (
    select c.created_at, case when c.kind = 'solve' then 'solve_check' else 'workbook' end as feature,
      case when c.provider = 'subscription' then 'subscription' else 'openrouter' end as provider,
      c.model, c.usd::numeric as cost_usd, greatest(coalesce(c.requests, 1), 1) as calls, c.parent_id, c.child_id, true as old, 'unknown'::text as usage_context, 'unknown'::text as key_alias, null::text as key_id, 'unknown'::text as cost_basis
    from public.workbook_run_ai_calls c
    where c.created_at >= p_from and c.created_at < p_to
      and not exists (select 1 from seen s where s.source_kind = 'workbook_run' and s.source_id = c.run_id::text
        and s.feature = case when c.kind = 'solve' then 'solve_check' else 'workbook' end)
    union all
    select m.created_at,
      case m.what when 'model' then 'maya' when 'review' then 'maya_review' when 'note' then 'maya_note' when 'profile' then 'child_profile' else 'maya_speech' end,
      case when m.what in ('speech_to_text', 'voice') then 'voice-provider' else 'openrouter' end, 'not recorded', m.cost_micros / 1000000.0 / p_cad_per_usd, 1, m.parent_id, m.child_id, true, case when exists (select 1 from public.maya_calls mc where mc.id = m.call_id and mc.kind = 'admin_test') then 'test' else 'unknown' end, 'unknown', null, 'estimate'
    from public.maya_spend m
    where m.created_at >= p_from and m.created_at < p_to and m.cost_micros is not null
      and (m.what in ('speech_to_text', 'voice')
        or m.call_id is null
        or not exists (select 1 from seen s where s.source_kind = 'maya_call' and s.source_id = m.call_id::text))
    union all
    select k.created_at, 'marking', 'openrouter', k.model, k.charged_micros / 1000000.0, 1, null::uuid, null::uuid, true, 'unknown', 'unknown', null, 'unknown'
    from public.scan_marking_spend k
    where k.created_at >= p_from and k.created_at < p_to and k.charged_micros is not null
      and (cut_marking is null or k.created_at < cut_marking)
    union all
    select x.created_at, 'explain', 'openrouter', x.model, x.charged_micros / 1000000.0, 1, null::uuid, null::uuid, true, 'unknown', 'unknown', null, 'unknown'
    from public.parent_explanation_spend x
    where x.created_at >= p_from and x.created_at < p_to and x.charged_micros is not null
      and (cut_explain is null or x.created_at < cut_explain)
  ),
  filtered as (
    select * from (select * from ledger union all select * from old_rows) a
    where p_with_tests or a.parent_id is null or a.parent_id not in (select parent_id from leftout)
  ),
  u as (
    select a.*, case
      when a.usage_context in ('practice', 'evaluation', 'test') then a.usage_context
      when a.parent_id in (select parent_id from leftout) then 'test-family'
      else a.usage_context end as context
    from filtered a
  ),
  dimensions as (
    select context, key_alias, key_id, feature, provider, model, cost_basis,
      parent_id, child_id, sum(cost_usd) as cost_usd, sum(calls) as calls,
      sum(calls) filter (where provider <> 'subscription' and cost_usd is null) as unpriced_calls
    from u group by 1,2,3,4,5,6,7,8,9
  ),
  by_context as (select context, sum(cost_usd) as cost_usd, sum(calls) as calls from u group by 1),
  by_key as (select key_alias, key_id, sum(cost_usd) as cost_usd, sum(calls) as calls from u group by 1,2),
  by_basis as (select cost_basis, sum(cost_usd) as cost_usd, sum(calls) as calls from u group by 1),
  lifetime_receipts as (
    -- Only identified provider receipts for the exact key can be matched to its account. No historical guesses.
    select key_id, sum(cost_usd) as cost_usd from public.ai_usage_events
    where provider = 'openrouter' and cost_basis = 'provider' and key_id is not null
      and generation_id is not null and created_at <= now()
    group by 1
  ),
  totals as (
    select coalesce(sum(cost_usd), 0) as cost_usd,
      coalesce(sum(cost_usd) filter (where not old), 0) as cost_ledger_usd,
      coalesce(sum(cost_usd) filter (where old), 0) as cost_history_usd,
      coalesce(sum(calls), 0) as calls,
      coalesce(sum(calls) filter (where provider = 'subscription'), 0) as subscription_calls,
      coalesce(sum(calls) filter (where provider <> 'subscription' and cost_usd is null), 0) as unpriced_calls
    from u
  ),
  daily as (
    -- The day of a call is the latest day start at or before it. The caller sends the day starts (the site's own
    -- Vancouver day rules, which a database time zone table may not match); with none, the database's Vancouver day.
    select case when p_day_starts is null then to_char(created_at at time zone 'America/Vancouver', 'YYYY-MM-DD')
      else to_char(coalesce((select max(s) from unnest(p_day_starts) s where s <= u.created_at), p_from) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end as day,
      model, sum(cost_usd) as cost_usd, sum(calls) as calls
    from u group by 1, 2
  ),
  by_feature as (
    select feature, sum(cost_usd) as cost_usd, sum(calls) as calls from u group by 1
  ),
  by_model as (
    select model, min(provider) as provider, sum(cost_usd) as cost_usd, sum(calls) as calls from u group by 1
  ),
  fam as (
    select parent_id, sum(cost_usd) as cost_usd, sum(calls) as calls from u group by 1
  ),
  fam_top as (
    select distinct on (parent_id) parent_id, feature
    from (select parent_id, feature, sum(cost_usd) as c, sum(calls) as n from u group by 1, 2) t
    order by parent_id, c desc nulls last, n desc
  ),
  fam_rev as (
    select s.parent_id,
      sum(s.monthly_cents) filter (where s.kind = 'paying' or (s.kind = 'ending' and s.ends_at > now())) as revenue_cents,
      bool_or(s.kind = 'free_month') as free_month
    from public.child_plan_states s group by 1
  ),
  families as (
    select f.parent_id, p.name, p.email,
      (select count(*) from public.children c where c.parent_id = f.parent_id) as children,
      f.cost_usd, f.calls, t.feature as top_feature, r.revenue_cents, coalesce(r.free_month, false) as free_month
    from fam f
    left join public.parents p on p.id = f.parent_id
    left join fam_top t on t.parent_id is not distinct from f.parent_id
    left join fam_rev r on r.parent_id = f.parent_id
    order by f.cost_usd desc nulls last, f.calls desc
    limit 200
  )
  select jsonb_build_object(
    'dimensions_version', 1,
    'dimensions', coalesce((select jsonb_agg(to_jsonb(d)) from (select d.*, p.name as parent_name, p.email as parent_email, c.first_name as child_name from dimensions d left join public.parents p on p.id=d.parent_id left join public.children c on c.id=d.child_id order by d.cost_usd desc nulls last, d.parent_id, d.child_id, d.feature, d.model, d.context, d.key_alias, d.key_id, d.provider, d.cost_basis limit 5000) d), '[]'),
    'dimensions_more', (select count(*) > 5000 from dimensions),
    'by_context', coalesce((select jsonb_agg(to_jsonb(d)) from by_context d), '[]'),
    'by_key', coalesce((select jsonb_agg(to_jsonb(d)) from by_key d), '[]'),
    'by_basis', coalesce((select jsonb_agg(to_jsonb(d)) from by_basis d), '[]'),
    'lifetime_receipts', coalesce((select jsonb_agg(to_jsonb(d)) from lifetime_receipts d), '[]'),
    'totals', (select to_jsonb(totals) from totals),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.day, d.model) from daily d), '[]'),
    'by_feature', coalesce((select jsonb_agg(to_jsonb(b) order by b.cost_usd desc nulls last, b.calls desc) from by_feature b), '[]'),
    'by_model', coalesce((select jsonb_agg(to_jsonb(b) order by b.cost_usd desc nulls last, b.calls desc) from by_model b), '[]'),
    'families', coalesce((select jsonb_agg(to_jsonb(f) order by f.cost_usd desc nulls last, f.calls desc) from families f), '[]')
  ) into result;
  return result;
end $$;
revoke all on function public.admin_ai_usage(timestamptz, timestamptz, boolean, numeric, timestamptz[]) from public, anon;
grant execute on function public.admin_ai_usage(timestamptz, timestamptz, boolean, numeric, timestamptz[]) to authenticated, service_role;

-- Per-child detail uses the existing family-local month, not the overview Vancouver range.
create or replace function public.admin_child_unit_cost(p_bounds jsonb, p_month text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare lo timestamptz; hi timestamptz; bad boolean; result jsonb; m_from date; m_to date;
begin
  if not (select public.is_admin()) then raise exception 'admin only' using errcode = '42501'; end if;
  if p_bounds is null or jsonb_typeof(p_bounds) <> 'array' or jsonb_array_length(p_bounds) > 20000 then raise exception 'bad bounds'; end if;
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'bad month'; end if;
  m_from := (p_month || '-01')::date;
  m_to := (m_from + interval '1 month')::date;
  select min((x->>'from')::timestamptz), max((x->>'to')::timestamptz),
    bool_or((x->>'to')::timestamptz <= (x->>'from')::timestamptz or (x->>'to')::timestamptz - (x->>'from')::timestamptz > interval '32 days')
    into lo, hi, bad from jsonb_array_elements(p_bounds) x;
  if bad then raise exception 'bad bounds'; end if;
  -- No early return when lo is null (empty bounds): the sums are then empty, and the budget lines are still read.

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
  detail as (
    select e.parent_id, e.child_id, e.feature, e.model, e.provider, e.cost_basis, e.key_alias, e.key_id,
      case when e.source_kind = 'maya_call' and exists (select 1 from public.maya_calls mc where mc.id::text = e.source_id and mc.kind = 'admin_test') then 'test'
        when e.usage_context in ('practice', 'evaluation', 'test') then e.usage_context
        when e.parent_id in (select parent_id from public.test_accounts union select user_id from public.admin_users) then 'test-family'
        else e.usage_context end as context,
      sum(e.cost_usd) as cost_usd, sum(e.calls) as calls,
      sum(e.calls) filter (where e.provider <> 'subscription' and e.cost_usd is null) as unpriced_calls
    from public.ai_usage_events e join b on b.parent_id=e.parent_id and e.created_at >= b.f and e.created_at < b.t
    group by 1,2,3,4,5,6,7,8,9
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
    where e.deleted_at is null and e.kind = 'expense' and e.entry_date >= m_from and e.entry_date < m_to
      and (lower(c.name) like '%print%' or lower(c.name) like '%postage%' or lower(c.name) like '%shipping%')
    group by 1
  )
  select jsonb_build_object(
    'sums', coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object('details', coalesce((select jsonb_agg(to_jsonb(d)) from detail d where d.parent_id=s.parent_id and d.child_id is not distinct from s.child_id), '[]'))) from sums s), '[]'),
    'budget', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from budget x), '[]')
  ) into result;
  return result;
end $$;
revoke all on function public.admin_child_unit_cost(jsonb, text) from public, anon;
grant execute on function public.admin_child_unit_cost(jsonb, text) to authenticated, service_role;
