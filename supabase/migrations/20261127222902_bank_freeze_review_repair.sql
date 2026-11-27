-- UNI-242 (B1) review repair of 20261127205833_bank_freeze_snapshots (docs/workbook-v2-bank.md). Additive only.
--   * A revised item (sheet, question, scenario, region pack) never changes without a higher revision, and its revision
--     never goes down, so an approval of one revision never covers other content (bank_require_new_revision). A row that
--     comes back after a delete must take a revision above every review of its key.
--   * A review names the current revision of a live item, checked under a share lock of the level row, which every write
--     and freeze locks for update (bank_review_current_revision).
--   * bank_freeze_level builds the items of the working copy in SQL (the draft form of draftFromRows, with the display
--     codes of withDisplayCodes) and refuses a snapshot whose items differ in any kind, key, place or content, the level
--     header and topics included.
--   * Snapshots and snapshot items can be inserted only inside bank_freeze_level, so nothing is added to a snapshot after
--     its freeze (bank_snapshot_insert_guard). The transaction-local flag is saved and restored, on errors too.
--   * Update and delete statements on the three insert-only tables are refused even when they match no row.
--   Every refusal is PT409 (never 40001) or 55000, and writes nothing.

-- Revision rule. tg_argv[0] is the key column of the table, tg_argv[1] the item kind of bank_reviews.
create function public.bank_require_new_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  -- Fields that change without a new revision: the state, the time of the write, and admin fields no snapshot holds.
  v_free text[] := array['revision', 'status', 'updated_at', 'level_band', 'clock_format', 'date_format', 'grade_names'];
  v_key text := to_jsonb(new)->>tg_argv[0];
  v_exists boolean;
  v_reviewed integer;
begin
  if tg_op = 'UPDATE' then
    if new.revision < old.revision then
      raise exception 'bank level %: % "%" would go back from revision % to %', new.level_id, tg_argv[1], v_key, old.revision, new.revision using errcode = 'PT409';
    end if;
    if new.revision = old.revision and (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
      raise exception 'bank level %: an edit needs a new revision: % "%" changes and keeps revision %', new.level_id, tg_argv[1], v_key, new.revision using errcode = 'PT409';
    end if;
    return new;
  end if;
  -- An insert, or the insert half of an upsert: a row that is there is checked by the update.
  execute format('select exists (select 1 from %I.%I where %I = $1 and level_id = $2)', tg_table_schema, tg_table_name, tg_argv[0])
    into v_exists using v_key, new.level_id;
  if v_exists then
    return new;
  end if;
  select max(r.revision) into v_reviewed from public.bank_reviews r
  where r.level_id = new.level_id and r.item_kind = tg_argv[1] and r.item_key = v_key;
  if v_reviewed is not null and new.revision <= v_reviewed then
    raise exception 'bank level %: % "%" comes back at revision %, which a review already names', new.level_id, tg_argv[1], v_key, new.revision using errcode = 'PT409';
  end if;
  return new;
end $$;

create trigger bank_sheets_require_new_revision before insert or update on public.bank_sheets
  for each row execute function public.bank_require_new_revision('sheet_id', 'sheet');
create trigger bank_questions_require_new_revision before insert or update on public.bank_questions
  for each row execute function public.bank_require_new_revision('id', 'question');
create trigger bank_scenarios_require_new_revision before insert or update on public.bank_scenarios
  for each row execute function public.bank_require_new_revision('id', 'scenario');
create trigger bank_region_packs_require_new_revision before insert or update on public.bank_region_packs
  for each row execute function public.bank_require_new_revision('id', 'region_pack');

-- A review counts only for the current revision of a live item, read after the level lock.
create function public.bank_review_current_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.bank_levels where id = new.level_id for share;
  if not exists (
    select 1 from public.bank_live_items(new.level_id) l
    where l.kind = new.item_kind and l.key = new.item_key and l.revision = new.revision
  ) then
    raise exception 'bank level %: % "%" is not a live item at revision %, so the review is refused', new.level_id, new.item_kind, new.item_key, new.revision
      using errcode = 'PT409';
  end if;
  return new;
end $$;

create trigger bank_reviews_current_revision before insert on public.bank_reviews
  for each row execute function public.bank_review_current_revision();

-- Snapshots and their items are written only by bank_freeze_level.
create function public.bank_snapshot_insert_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_setting('unica.in_bank_freeze_level', true) is distinct from '1' then
    raise exception '%: an insert is refused outside bank_freeze_level; a snapshot never changes after its freeze', tg_table_name using errcode = '55000';
  end if;
  return null;
end $$;

create trigger bank_snapshots_insert_guard before insert on public.bank_snapshots
  for each statement execute function public.bank_snapshot_insert_guard();
create trigger bank_snapshot_items_insert_guard before insert on public.bank_snapshot_items
  for each statement execute function public.bank_snapshot_insert_guard();

-- Statement triggers: an update or delete that matches no row is refused too.
create trigger bank_reviews_refuse_statement before update or delete on public.bank_reviews
  for each statement execute function public.bank_refuse_change();
create trigger bank_snapshots_refuse_statement before update or delete on public.bank_snapshots
  for each statement execute function public.bank_refuse_change();
create trigger bank_snapshot_items_refuse_statement before update or delete on public.bank_snapshot_items
  for each statement execute function public.bank_refuse_change();

-- One snapshot in one transaction (same argument as before). The items must be exactly the items of the working copy.
create or replace function public.bank_freeze_level(p_freeze jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_prev_flag text := current_setting('unica.in_bank_freeze_level', true);
  v_level_id text := p_freeze->>'levelId';
  v_expected timestamptz := (p_freeze->>'expected')::timestamptz;
  v_version integer := (p_freeze->>'version')::integer;
  v_name text := p_freeze->>'name';
  v_items jsonb := coalesce(p_freeze->'items', '[]');
  v_level public.bank_levels;
  v_next integer;
  v_problem text;
  v_snapshot uuid;
  v_written integer;
begin
  select * into v_level from public.bank_levels where id = v_level_id for update;
  if not found then
    raise exception 'bank level %: there is no such level', v_level_id using errcode = '22023';
  end if;
  if v_expected is null or v_level.updated_at <> v_expected then
    raise exception 'bank level %: it changed since it was read', v_level_id using errcode = 'PT409';
  end if;
  if v_level.display_name !~ '^[1-9][0-9]?$' then
    raise exception 'bank level %: its name must be a number from 1 to 99', v_level_id using errcode = 'PT409';
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

  -- The snapshot holds every revised item of the working copy that is not retired.
  select string_agg(format('%s "%s"', coalesce(l.kind, i.kind), coalesce(l.key, i.key)), ', ') into v_problem
  from public.bank_live_items(v_level_id) l
  full join (
    select r.kind, r.key from jsonb_to_recordset(v_items) as r(kind text, key text) where r.kind in ('sheet', 'question', 'scenario', 'region_pack')
  ) i on i.kind = l.kind and i.key = l.key
  where l.key is null or i.key is null;
  if v_problem is not null then
    raise exception 'bank level %: the snapshot items do not match the working copy: %', v_level_id, v_problem using errcode = 'PT409';
  end if;

  -- Each item, the level header and topics included, is the working copy as draftFromRows and withDisplayCodes give it
  -- (src/lib/workbook-v2-bank/draft.ts, snapshot-items.ts): same kind, key, place and content (jsonb equality).
  with topics as (
    select t.id, t.title, (row_number() over (order by t.position, t.id) - 1)::integer as pos
    from public.bank_topics t where t.level_id = v_level_id and t.status <> 'retired'
  ), sheets as (
    select s.sheet_id, s.content, tp.pos as topic_pos, row_number() over (partition by s.topic_id order by s.position, s.sheet_id) as in_topic
    from public.bank_sheets s join topics tp on tp.id = s.topic_id
    where s.level_id = v_level_id and s.status <> 'retired'
  ), placed as (
    select p.sheet_id, p.content, p.topic_pos, p.in_topic, (row_number() over (order by p.topic_pos, p.in_topic) - 1)::integer as pos from sheets p
  ), expected (kind, key, position, content) as (
    select 'level', v_level.id, 0,
      jsonb_build_object('id', v_name, 'level', jsonb_build_object('id', v_level.id, 'name', v_level.display_name))
      || case when coalesce((v_level.config->'draft') ? 'format', false) then jsonb_build_object('format', v_level.config->'draft'->'format') else '{}'::jsonb end
      || case when v_level.default_region is null then '{}'::jsonb else jsonb_build_object('defaultRegion', v_level.default_region) end
    union all
    select 'topic', t.id, t.pos, jsonb_build_object('id', t.id, 'code', v_level.display_name || '-' || (t.pos + 1), 'title', t.title,
      'sheets', coalesce((select jsonb_agg(p.sheet_id order by p.in_topic) from placed p where p.topic_pos = t.pos), '[]'::jsonb))
    from topics t
    union all
    select 'sheet', p.sheet_id, p.pos, jsonb_build_object('id', p.sheet_id, 'firstPage', 1 + 2 * p.pos, 'front', p.content->'front', 'back', p.content->'back')
    from placed p
    union all
    select 'question', q.id, (row_number() over (order by q.position, q.id) - 1)::integer,
      jsonb_build_object('id', q.id, 'scenarioKind', q.scenario_kind, 'slots', q.slots, 'unit', q.unit, 'solver', q.solver, 'difficulty', q.difficulty, 'phrasings', q.phrasings)
      || case when q.regions is null then '{}'::jsonb else jsonb_build_object('regions', to_jsonb(q.regions)) end
    from public.bank_questions q where v_level.default_region is not null and q.level_id = v_level_id and q.status <> 'retired'
    union all
    select 'scenario', s.id, (row_number() over (order by s.position, s.id) - 1)::integer,
      jsonb_build_object('id', s.id, 'interest', s.interest, 'kind', s.kind) || s.content
    from public.bank_scenarios s where v_level.default_region is not null and s.level_id = v_level_id and s.status <> 'retired'
    union all
    select 'region_pack', r.id, (row_number() over (order by r.position, r.id) - 1)::integer,
      jsonb_build_object('id', r.id, 'units', r.units, 'coins', r.coins, 'spelling', r.spelling)
    from public.bank_region_packs r where v_level.default_region is not null and r.level_id = v_level_id and r.status <> 'retired'
  ), given as (
    select g.kind, g.key, g.position, g.content from jsonb_to_recordset(v_items) as g(kind text, key text, position integer, content jsonb)
  )
  select string_agg(format('%s "%s"', coalesce(e.kind, g.kind), coalesce(e.key, g.key)), ', ' order by coalesce(e.kind, g.kind), coalesce(e.key, g.key)) into v_problem
  from expected e full join given g on g.kind = e.kind and g.key = e.key
  where e.key is null or g.key is null or g.position is distinct from e.position or g.content is distinct from e.content;
  if v_problem is not null then
    raise exception 'bank level %: the content of these snapshot items is not the approved working copy: %', v_level_id, v_problem using errcode = 'PT409';
  end if;

  perform set_config('unica.in_bank_freeze_level', '1', true);
  begin
    insert into public.bank_snapshots (level_id, version, name, content_hash, manifest_hash, min_engine_version, item_count, frozen_by)
    values (v_level_id, v_next, v_name, p_freeze->>'contentHash', p_freeze->>'manifestHash', p_freeze->>'minEngineVersion',
      jsonb_array_length(v_items), p_freeze->>'frozenBy')
    returning id into v_snapshot;

    insert into public.bank_snapshot_items (snapshot_id, kind, key, position, content, hash)
    select v_snapshot, r.kind, r.key, r.position, r.content, r.hash
    from jsonb_to_recordset(v_items) as r(kind text, key text, position integer, content jsonb, hash text);
    get diagnostics v_written = row_count;
    if v_written <> jsonb_array_length(v_items) then
      raise exception 'bank level %: % of % snapshot items were written', v_level_id, v_written, jsonb_array_length(v_items) using errcode = 'PT409';
    end if;
    perform set_config('unica.in_bank_freeze_level', coalesce(v_prev_flag, ''), true);
  exception when others then
    perform set_config('unica.in_bank_freeze_level', coalesce(v_prev_flag, ''), true);
    raise;
  end;

  return jsonb_build_object('snapshotId', v_snapshot, 'version', v_next);
end $$;

revoke all on function public.bank_require_new_revision() from public, anon, authenticated;
grant execute on function public.bank_require_new_revision() to service_role;
revoke all on function public.bank_review_current_revision() from public, anon, authenticated;
grant execute on function public.bank_review_current_revision() to service_role;
revoke all on function public.bank_snapshot_insert_guard() from public, anon, authenticated;
grant execute on function public.bank_snapshot_insert_guard() to service_role;
grant execute on function public.bank_refuse_change() to service_role;
revoke all on function public.bank_freeze_level(jsonb) from public, anon, authenticated;
grant execute on function public.bank_freeze_level(jsonb) to service_role;
