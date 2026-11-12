-- AI usage ledger (D-330). One append-only row for each AI call that came back with usage: when, which feature,
-- which provider and model, the tokens, the cost in US dollars (null when the provider gave none, as with the
-- subscription), OpenRouter's generation id, and the family and child when the caller knows them. source_kind and
-- source_id link the row to the thing that made the call (a workbook run, a Maya call). A call with no family (team
-- tools, sample runs) has a null parent_id.
--
-- Writes: the server only, with the secret key, one row at a time (the recorder never lets a failed write reach its
-- caller). No update: a trigger refuses it. Reads: admins; parents read nothing. A family deletion removes the rows
-- through the foreign keys; the family write fence and the child deletion fence cover new rows.
--
-- admin_ai_usage(...) reads this ledger and adds the cost the older ledgers hold, for history from before it
-- (workbook_run_ai_calls, maya_spend, scan_marking_spend, parent_explanation_spend). One call
-- never counts twice: the new ledger wins (see the comments in the function). Additive: one table, one function.
create table public.ai_usage_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  feature text not null check (feature in (
    'workbook', 'solve_check', 'workbook_gate', 'maya', 'maya_review', 'maya_note', 'maya_speech', 'child_profile',
    'learner_profile', 'report', 'work_review', 'marking', 'explain', 'photo_check', 'other')),
  provider text not null check (provider in ('openrouter', 'anthropic', 'subscription')),
  model text not null check (char_length(model) between 1 and 200),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  cost_usd numeric(14, 8) check (cost_usd >= 0),
  calls integer not null default 1 check (calls between 1 and 1000),
  generation_id text check (generation_id is null or char_length(generation_id) between 1 and 200),
  parent_id uuid references public.parents (id) on delete cascade,
  child_id uuid,
  source_kind text check (source_kind is null or char_length(source_kind) between 1 and 60),
  source_id text check (source_id is null or char_length(source_id) between 1 and 200),
  constraint ai_usage_events_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade,
  check (child_id is null or parent_id is not null),
  check ((source_kind is null) = (source_id is null))
);
create unique index ai_usage_events_generation_key on public.ai_usage_events (generation_id) where generation_id is not null;
create index ai_usage_events_time_idx on public.ai_usage_events (created_at);
create index ai_usage_events_parent_idx on public.ai_usage_events (parent_id) where parent_id is not null;
create index ai_usage_events_source_idx on public.ai_usage_events (source_kind, source_id) where source_id is not null;

alter table public.ai_usage_events enable row level security;
revoke all on table public.ai_usage_events from anon, authenticated, service_role;
grant select on table public.ai_usage_events to authenticated, service_role;
grant insert on table public.ai_usage_events to service_role;
create policy "Admins read AI usage" on public.ai_usage_events for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.ai_usage_events
  for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.ai_usage_events
  for each row execute function public.fence_child_delete_write();
create function public.refuse_ai_usage_update() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'ai_usage_events is append only' using errcode = '55000'; end $$;
create trigger append_only before update on public.ai_usage_events
  for each row execute function public.refuse_ai_usage_update();

-- p_day_starts: the start instant of each day of the period by the site's own Vancouver day rules (src/lib/family-time.ts,
-- with its dated overrides), which a database time zone table can differ from. The daily cost is grouped by the latest
-- start at or before each call; with no p_day_starts it groups by the database's Vancouver day.
-- The admin overview of AI usage for [p_from, p_to): totals, a daily cost by model, cost by feature, cost by model and
-- one line per family. Admins only. Test families and admins' own families are left out unless p_with_tests; calls
-- with no family stay in (they are team and sample work, shown as one line).
-- p_cad_per_usd turns Maya's older CAD ledger back into US dollars (MAYA_USD_TO_CAD).
--
-- History and no double count. A row of the new ledger always wins:
--   * a workbook run's calls and solve checks: workbook_run_ai_calls holds both (kind 'solve' is the solve check, and
--     workbook_run_solves repeats the same checks, so it is not read). A run that has any new-ledger row of that
--     feature skips its older rows;
--   * a Maya call (model, review, note): a call with any new-ledger row skips its older maya_spend rows; speech and
--     voice are estimates that the new ledger never holds, so they always count (feature maya_speech);
--   * scan marking and parent explanations: the older rows hold no family. They count only before the first new-ledger
--     row of that feature.
-- Older rows with no model name show as model 'not recorded'.
create function public.admin_ai_usage(p_from timestamptz, p_to timestamptz, p_with_tests boolean default false, p_cad_per_usd numeric default 1.40, p_day_starts timestamptz[] default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare cut_marking timestamptz; cut_explain timestamptz; result jsonb;
begin
  if not (select public.is_admin()) then raise exception 'admin only' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'bad period';
  end if;
  if p_cad_per_usd is null or p_cad_per_usd <= 0 then p_cad_per_usd := 1.40; end if;
  select min(created_at) into cut_marking from public.ai_usage_events where feature = 'marking';
  select min(created_at) into cut_explain from public.ai_usage_events where feature = 'explain';

  with leftout as (
    select parent_id from public.test_accounts union select user_id from public.admin_users
  ),
  ledger as (
    select e.created_at, e.feature, e.provider, e.model, e.cost_usd, e.calls, e.parent_id, e.child_id, false as old
    from public.ai_usage_events e where e.created_at >= p_from and e.created_at < p_to
  ),
  seen as (
    select distinct e.source_kind, e.source_id, e.feature from public.ai_usage_events e
    where e.source_id is not null and e.created_at >= p_from - interval '2 days' and e.created_at < p_to + interval '2 days'
  ),
  old_rows as (
    select c.created_at, case when c.kind = 'solve' then 'solve_check' else 'workbook' end as feature,
      case when c.provider = 'subscription' then 'subscription' else 'openrouter' end as provider,
      c.model, c.usd::numeric as cost_usd, greatest(coalesce(c.requests, 1), 1) as calls, c.parent_id, c.child_id, true as old
    from public.workbook_run_ai_calls c
    where c.created_at >= p_from and c.created_at < p_to
      and not exists (select 1 from seen s where s.source_kind = 'workbook_run' and s.source_id = c.run_id::text
        and s.feature = case when c.kind = 'solve' then 'solve_check' else 'workbook' end)
    union all
    select m.created_at,
      case m.what when 'model' then 'maya' when 'review' then 'maya_review' when 'note' then 'maya_note' when 'profile' then 'child_profile' else 'maya_speech' end,
      'openrouter', 'not recorded', m.cost_micros / 1000000.0 / p_cad_per_usd, 1, m.parent_id, m.child_id, true
    from public.maya_spend m
    where m.created_at >= p_from and m.created_at < p_to and m.cost_micros is not null
      and (m.what in ('speech_to_text', 'voice')
        or m.call_id is null
        or not exists (select 1 from seen s where s.source_kind = 'maya_call' and s.source_id = m.call_id::text))
    union all
    select k.created_at, 'marking', 'openrouter', k.model, k.charged_micros / 1000000.0, 1, null::uuid, null::uuid, true
    from public.scan_marking_spend k
    where k.created_at >= p_from and k.created_at < p_to and k.charged_micros is not null
      and (cut_marking is null or k.created_at < cut_marking)
    union all
    select x.created_at, 'explain', 'openrouter', x.model, x.charged_micros / 1000000.0, 1, null::uuid, null::uuid, true
    from public.parent_explanation_spend x
    where x.created_at >= p_from and x.created_at < p_to and x.charged_micros is not null
      and (cut_explain is null or x.created_at < cut_explain)
  ),
  u as (
    select * from (select * from ledger union all select * from old_rows) a
    where p_with_tests or a.parent_id is null or a.parent_id not in (select parent_id from leftout)
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
      else to_char((select max(s) from unnest(p_day_starts) s where s <= u.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end as day,
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
