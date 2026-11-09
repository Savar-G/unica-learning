-- #476: save_next_book_plan accepts the real planner's answer (planNextBookFromSnapshot, src/lib/workbook-next-book-snapshot.ts).
-- The planner names, for each consumed mark, its first version and the second tries it read, and it holds a printed
-- review with no question under a null key. The first version of this function took only {key, version} and a text key,
-- so it refused every real plan.
--
-- Additive: the old shapes are still accepted, so the site version before this change keeps working. Every other rule
-- is the same: once per revision, the same plan again is a retry, and each consumed entry names one ledger entry at its
-- frozen version, once. The memory store (src/lib/next-book-snapshot-memory.ts) keeps the same rules.

-- A JSON whole number from 1 to 2^53 - 1, without casting anything that is not a number.
create or replace function public._next_book_count(v jsonb) returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) = 'number'
    then (v::text)::numeric >= 1 and (v::text)::numeric <= 9007199254740991 and (v::text)::numeric = trunc((v::text)::numeric)
    else false end
$$;

-- One consumed entry: key and version (the ledger's effective version); optional firstVersion at or before it; optional
-- correctionIds, distinct non-empty strings. No other field.
create or replace function public._next_book_consumed_ok(x jsonb) returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(x) is distinct from 'object' then false
    when exists(select 1 from jsonb_object_keys(x) k where k not in ('key', 'version', 'firstVersion', 'correctionIds')) then false
    when jsonb_typeof(x->'key') is distinct from 'string' or not public._next_book_count(x->'version') then false
    -- Nested, so nothing that is not a number is ever cast (SQL does not promise the order of "and").
    when x ? 'firstVersion' and not (case when public._next_book_count(x->'firstVersion')
      then ((x->'firstVersion')::text)::numeric <= ((x->'version')::text)::numeric else false end) then false
    when x ? 'correctionIds' and (jsonb_typeof(x->'correctionIds') is distinct from 'array'
      or exists(select 1 from jsonb_array_elements(x->'correctionIds') c where jsonb_typeof(c) is distinct from 'string' or c #>> '{}' = '')
      or (select count(*) <> count(distinct c) from jsonb_array_elements(x->'correctionIds') c)) then false
    else true end
$$;

-- One held entry: key a string or null, reason a string; optional skill (string), step and version (whole numbers).
create or replace function public._next_book_held_ok(x jsonb) returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(x) is distinct from 'object' then false
    when exists(select 1 from jsonb_object_keys(x) k where k not in ('key', 'reason', 'skill', 'step', 'version')) then false
    when not (x ? 'key') or jsonb_typeof(x->'key') not in ('string', 'null') or jsonb_typeof(x->'reason') is distinct from 'string' then false
    when x ? 'skill' and jsonb_typeof(x->'skill') is distinct from 'string' then false
    when x ? 'step' and not public._next_book_count(x->'step') then false
    when x ? 'version' and not public._next_book_count(x->'version') then false
    else true end
$$;

-- Once per revision. The same plan again is a retry; another plan is a conflict. consumed must lie inside the ledger.
create or replace function public.save_next_book_plan(p_snapshot uuid, p_plan_input jsonb, p_plan_hash text, p_consumed jsonb, p_held jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.next_book_snapshots; problem text;
begin
  select * into s from public.next_book_snapshots where id = p_snapshot;
  if not found then return jsonb_build_object('status','refused','reason','snapshot-not-found'); end if;
  perform public.assert_family_writable(s.parent_id);
  if s.draft_id is not null then
    problem := public._next_book_draft_locked(s.draft_id, s.parent_id, s.child_id);
    if problem is not null then return jsonb_build_object('status','refused','reason',problem); end if;
  end if;
  select * into s from public.next_book_snapshots where id = p_snapshot for update;
  if s.plan_hash is not null then
    if s.plan_hash is distinct from p_plan_hash or s.plan_input is distinct from p_plan_input
      or s.planner_consumed is distinct from p_consumed or s.planner_held is distinct from p_held then
      return jsonb_build_object('status','refused','reason','plan-conflict');
    end if;
    return jsonb_build_object('status','ok','snapshot',to_jsonb(s));
  end if;
  if s.frozen_at is null then return jsonb_build_object('status','refused','reason','not-frozen'); end if;
  problem := public._next_book_source_problem(s.workbook_id, s.printed_revision);
  if problem is not null then return jsonb_build_object('status','refused','reason',problem); end if;
  if p_plan_hash is null or p_plan_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_plan_input) is distinct from 'object'
    or jsonb_typeof(p_consumed) is distinct from 'array' or jsonb_typeof(p_held) is distinct from 'array'
    or exists(select 1 from jsonb_array_elements(p_held) x where not public._next_book_held_ok(x)) then
    return jsonb_build_object('status','refused','reason','invalid-plan');
  end if;
  -- Each consumed entry has the allowed shape, names one ledger entry at its frozen version, and appears once.
  if exists(select 1 from jsonb_array_elements(p_consumed) x where not public._next_book_consumed_ok(x)
      or not exists(select 1 from jsonb_array_elements(s.consumed_ledger) l
        where l->'key' = x->'key' and l->'version' = x->'version'))
    or (select count(*) <> count(distinct x->'key') from jsonb_array_elements(p_consumed) x) then
    return jsonb_build_object('status','refused','reason','consumed-outside-ledger');
  end if;
  update public.next_book_snapshots set plan_input = p_plan_input, plan_hash = p_plan_hash, planner_consumed = p_consumed, planner_held = p_held
    where id = p_snapshot returning * into s;
  return jsonb_build_object('status','ok','snapshot',to_jsonb(s));
end $$;

-- The helpers are private: only save_next_book_plan (security definer) calls them. The function keeps its grants
-- through "create or replace"; they are set again here so this file stands alone.
revoke all on function public._next_book_count(jsonb) from public, anon, authenticated, service_role;
revoke all on function public._next_book_consumed_ok(jsonb) from public, anon, authenticated, service_role;
revoke all on function public._next_book_held_ok(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.save_next_book_plan(uuid,jsonb,text,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_next_book_plan(uuid,jsonb,text,jsonb,jsonb) to service_role;
