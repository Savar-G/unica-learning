-- UNI-242 (B1): reviews and frozen snapshots of the bank (architecture spec 9.2, docs/workbook-v2-bank.md). Additive only.
--   * bank_reviews: one row per review of one exact revision of a sheet, question, scenario or region pack. The latest
--     review of a revision decides. An edit makes a new revision, which needs a new approval.
--   * bank_snapshots, bank_snapshot_items: a frozen level, one row per item (the level header, topics, sheets, questions,
--     scenarios, region packs). A book depends on exactly one snapshot.
--   * All three tables are insert only: a trigger refuses every update, delete and truncate, for every role.
--   * `basis` (a note about a source) can never be in a snapshot item: a check constraint refuses it at any depth.
--   * bank_freeze_level: writes one snapshot in one transaction, and refuses (PT409) a stale read, a taken version, an
--     item that is not approved at its current revision, and items that do not match the working copy.
--   * Service-role only: browser roles (anon, authenticated) have no grants and no policies.

create table public.bank_reviews (
  id bigint generated always as identity primary key,
  level_id text not null references public.bank_levels (id),
  item_kind text not null check (item_kind in ('sheet', 'question', 'scenario', 'region_pack')),
  item_key text not null check (item_key ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,63}$'),
  revision integer not null check (revision >= 1),
  reviewer text not null check (char_length(reviewer) between 1 and 200),
  decision text not null check (decision in ('approved', 'rejected')),
  comment text check (char_length(comment) <= 4000),
  created_at timestamptz not null default now()
);
create index bank_reviews_item_idx on public.bank_reviews (level_id, item_kind, item_key, revision, id);

create table public.bank_snapshots (
  id uuid primary key default gen_random_uuid(),
  level_id text not null references public.bank_levels (id),
  version integer not null check (version >= 1),
  name text not null unique check (name ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  min_engine_version text not null check (char_length(min_engine_version) between 1 and 40),
  item_count integer not null check (item_count >= 1),
  frozen_by text not null check (char_length(frozen_by) between 1 and 200),
  frozen_at timestamptz not null default now(),
  unique (level_id, version)
);

create table public.bank_snapshot_items (
  snapshot_id uuid not null references public.bank_snapshots (id),
  kind text not null check (kind in ('level', 'topic', 'sheet', 'question', 'scenario', 'region_pack')),
  key text not null check (key ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,63}$'),
  position integer not null check (position >= 0),
  content jsonb not null constraint bank_snapshot_items_content_check
    check (jsonb_typeof(content) = 'object' and not jsonb_path_exists(content, 'lax $.**.basis')),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  primary key (snapshot_id, kind, key)
);

-- Insert only. The trigger runs for every role, the service role and the table owner included.
create function public.bank_refuse_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception '%: % is refused, because the table is insert only', tg_table_name, lower(tg_op) using errcode = '55000';
end $$;

create trigger bank_reviews_insert_only before update or delete on public.bank_reviews
  for each row execute function public.bank_refuse_change();
create trigger bank_reviews_no_truncate before truncate on public.bank_reviews
  for each statement execute function public.bank_refuse_change();
create trigger bank_snapshots_insert_only before update or delete on public.bank_snapshots
  for each row execute function public.bank_refuse_change();
create trigger bank_snapshots_no_truncate before truncate on public.bank_snapshots
  for each statement execute function public.bank_refuse_change();
create trigger bank_snapshot_items_insert_only before update or delete on public.bank_snapshot_items
  for each row execute function public.bank_refuse_change();
create trigger bank_snapshot_items_no_truncate before truncate on public.bank_snapshot_items
  for each statement execute function public.bank_refuse_change();

alter table public.bank_reviews enable row level security;
alter table public.bank_snapshots enable row level security;
alter table public.bank_snapshot_items enable row level security;
revoke all on public.bank_reviews, public.bank_snapshots, public.bank_snapshot_items from public, anon, authenticated;
grant all on public.bank_reviews, public.bank_snapshots, public.bank_snapshot_items to service_role;

-- The items of a level that are not retired, with their current revisions: what a freeze must approve and copy.
create function public.bank_live_items(p_level_id text)
returns table (kind text, key text, revision integer) language sql stable security invoker set search_path = '' as $$
  select 'sheet', sheet_id, revision from public.bank_sheets where level_id = p_level_id and status <> 'retired'
  union all select 'question', id, revision from public.bank_questions where level_id = p_level_id and status <> 'retired'
  union all select 'scenario', id, revision from public.bank_scenarios where level_id = p_level_id and status <> 'retired'
  union all select 'region_pack', id, revision from public.bank_region_packs where level_id = p_level_id and status <> 'retired'
$$;

-- One snapshot in one transaction. p_freeze: { levelId, expected, version, name, frozenBy, minEngineVersion, contentHash,
-- manifestHash, items: [{ kind, key, position, content, hash }] }, where `expected` is bank_levels.updated_at as the
-- freeze read it and `version` is the next version of the level. Every refusal writes nothing.
create function public.bank_freeze_level(p_freeze jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_level_id text := p_freeze->>'levelId';
  v_expected timestamptz := (p_freeze->>'expected')::timestamptz;
  v_version integer := (p_freeze->>'version')::integer;
  v_items jsonb := coalesce(p_freeze->'items', '[]');
  v_current timestamptz;
  v_next integer;
  v_problem text;
  v_snapshot uuid;
  v_written integer;
begin
  select updated_at into v_current from public.bank_levels where id = v_level_id for update;
  if not found then
    raise exception 'bank level %: there is no such level', v_level_id using errcode = '22023';
  end if;
  if v_expected is null or v_current <> v_expected then
    raise exception 'bank level %: it changed since it was read', v_level_id using errcode = 'PT409';
  end if;
  select coalesce(max(version), 0) + 1 into v_next from public.bank_snapshots where level_id = v_level_id;
  if v_version is distinct from v_next then
    raise exception 'bank level %: version % is taken or skipped; the next version is %', v_level_id, v_version, v_next using errcode = 'PT409';
  end if;

  -- The latest review of the current revision of every item that is not retired must be an approval.
  select string_agg(format('%s "%s" (revision %s)', l.kind, l.key, l.revision), ', ' order by l.kind, l.key) into v_problem
  from public.bank_live_items(v_level_id) l
  left join lateral (
    select r.decision from public.bank_reviews r
    where r.level_id = v_level_id and r.item_kind = l.kind and r.item_key = l.key and r.revision = l.revision
    order by r.id desc limit 1
  ) latest on true
  where latest.decision is distinct from 'approved';
  if v_problem is not null then
    raise exception 'bank level %: these items are not approved at their current revision: %', v_level_id, v_problem using errcode = 'PT409';
  end if;

  -- The snapshot holds exactly the items of the working copy that are not retired.
  select string_agg(format('%s "%s"', coalesce(l.kind, i.kind), coalesce(l.key, i.key)), ', ') into v_problem
  from public.bank_live_items(v_level_id) l
  full join (
    select r.kind, r.key from jsonb_to_recordset(v_items) as r(kind text, key text) where r.kind in ('sheet', 'question', 'scenario', 'region_pack')
  ) i on i.kind = l.kind and i.key = l.key
  where l.key is null or i.key is null;
  if v_problem is not null then
    raise exception 'bank level %: the snapshot items do not match the working copy: %', v_level_id, v_problem using errcode = 'PT409';
  end if;

  insert into public.bank_snapshots (level_id, version, name, content_hash, manifest_hash, min_engine_version, item_count, frozen_by)
  values (v_level_id, v_next, p_freeze->>'name', p_freeze->>'contentHash', p_freeze->>'manifestHash', p_freeze->>'minEngineVersion',
    jsonb_array_length(v_items), p_freeze->>'frozenBy')
  returning id into v_snapshot;

  insert into public.bank_snapshot_items (snapshot_id, kind, key, position, content, hash)
  select v_snapshot, r.kind, r.key, r.position, r.content, r.hash
  from jsonb_to_recordset(v_items) as r(kind text, key text, position integer, content jsonb, hash text);
  get diagnostics v_written = row_count;
  if v_written <> jsonb_array_length(v_items) then
    raise exception 'bank level %: % of % snapshot items were written', v_level_id, v_written, jsonb_array_length(v_items) using errcode = 'PT409';
  end if;

  return jsonb_build_object('snapshotId', v_snapshot, 'version', v_next);
end $$;

revoke all on function public.bank_refuse_change() from public, anon, authenticated;
revoke all on function public.bank_live_items(text) from public, anon, authenticated;
grant execute on function public.bank_live_items(text) to service_role;
revoke all on function public.bank_freeze_level(jsonb) from public, anon, authenticated;
grant execute on function public.bank_freeze_level(jsonb) to service_role;
