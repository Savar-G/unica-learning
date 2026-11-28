-- UNI-242 (B1) second review repair of 20261127205833_bank_freeze_snapshots and 20261127224116_bank_freeze_review_repair
-- (docs/workbook-v2-bank.md). Additive only.
--   * A revised item (sheet, question, scenario, region pack) keeps its key and its level for life: an update that renames
--     it, or moves it to another level, is refused, so it can never take over the approval of another item.
--   * The insert check of bank_require_new_revision locks the row of the same key before it skips the review history. A
--     row that another transaction deletes at the same time is waited for, and the history check then runs.
--   * Only bank_freeze_level writes snapshots: it runs as the owner of the tables (security definer), and the service role
--     can only read the two snapshot tables. Setting the freeze flag no longer opens the insert. The service role can only
--     read and insert reviews.
--   * bank_freeze_level checks the hash of every item, the manifest hash and the content hash against the canonical JSON
--     of the items (bank_canonical_json, the same text as canonicalJson in src/lib/workbook-v2/hash.ts), so a stored
--     snapshot always has true hashes.
--   Every refusal is PT409 (never 40001) or 55000, and writes nothing.

-- The key order of canonicalJson: array-index keys (0 to 2^32 - 2) first, as numbers, then the other keys by code unit.
create function public.bank_json_key_index(p_key text)
returns bigint language sql immutable parallel safe set search_path = '' as $$
  select case when p_key ~ '^(0|[1-9][0-9]{0,9})$' then case when p_key::bigint <= 4294967294 then p_key::bigint end end
$$;

-- UTF-8 sorts supplementary characters after all BMP characters. JavaScript's UTF-16 sort puts them before
-- U+E000 through U+FFFF. Move the lead bytes EE and EF after F4, the last valid lead byte.
create function public.bank_json_utf16_sort_key(p_key text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select replace(replace(regexp_replace(encode(convert_to(p_key, 'UTF8'), 'hex'), '(..)', ' \1', 'g'), ' ee', ' f5'), ' ef', ' f6')
$$;

-- canonicalJson in SQL: sorted keys, no spaces. Strings and numbers keep the JSON text of jsonb, which is the text that
-- JSON.stringify sent (a number that JavaScript writes with an exponent comes back without one, so its hash differs and
-- the freeze is refused: the check fails closed).
create function public.bank_canonical_json(p_value jsonb)
returns text language sql immutable parallel safe set search_path = '' as $$
  select case jsonb_typeof(p_value)
    when 'object' then '{' || coalesce((
      select string_agg(to_jsonb(e.key)::text || ':' || public.bank_canonical_json(e.value), ','
        order by public.bank_json_key_index(e.key) is null, public.bank_json_key_index(e.key), public.bank_json_utf16_sort_key(e.key) collate "C")
      from jsonb_each(p_value) e), '') || '}'
    when 'array' then '[' || coalesce((
      select string_agg(public.bank_canonical_json(a.value), ',' order by a.ord)
      from jsonb_array_elements(p_value) with ordinality a(value, ord)), '') || ']'
    when 'number' then trim_scale(p_value::text::numeric)::text
    else p_value::text
  end
$$;

-- Revision rule (as 20261127224116), and an item keeps its key and level; the insert check locks the row of its key.
create or replace function public.bank_require_new_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  -- Fields that change without a new revision: the state, the time of the write, and admin fields no snapshot holds.
  v_free text[] := array['revision', 'status', 'updated_at', 'level_band', 'clock_format', 'date_format', 'grade_names'];
  v_key text := to_jsonb(new)->>tg_argv[0];
  v_exists boolean;
  v_reviewed integer;
begin
  if tg_op = 'UPDATE' then
    if v_key is distinct from to_jsonb(old)->>tg_argv[0] or new.level_id is distinct from old.level_id then
      raise exception 'bank level %: % "%" keeps its key and level; it cannot become % "%" of level %', old.level_id, tg_argv[1], to_jsonb(old)->>tg_argv[0], tg_argv[1], v_key, new.level_id
        using errcode = 'PT409';
    end if;
    if new.revision < old.revision then
      raise exception 'bank level %: % "%" would go back from revision % to %', new.level_id, tg_argv[1], v_key, old.revision, new.revision using errcode = 'PT409';
    end if;
    if new.revision = old.revision and (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
      raise exception 'bank level %: an edit needs a new revision: % "%" changes and keeps revision %', new.level_id, tg_argv[1], v_key, new.revision using errcode = 'PT409';
    end if;
    return new;
  end if;
  -- An insert, or the insert half of an upsert. A row that is there is checked by the update. The lock waits for a
  -- transaction that deletes the row; when the delete commits, no row is found and the review history is checked.
  execute format('select true from %I.%I where %I = $1 and level_id = $2 for update', tg_table_schema, tg_table_name, tg_argv[0])
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

-- One snapshot in one transaction (same argument as before), written as the owner of the tables. The items must be
-- exactly the items of the working copy, and every hash must be the hash of the canonical JSON.
create or replace function public.bank_freeze_level(p_freeze jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  v_manifest text;
  v_content text;
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

  -- The hashes (snapshot-items.ts): each item's hash is the SHA-256 of the canonical JSON of its content; the manifest is
  -- the list of { kind, key, position, hash } in kind order, then place; the content hash is the hash of the whole
  -- snapshot, which is the header with its lists (the word-problem lists only when the header names a default region).
  with given as (
    select g.kind, g.key, g.position, g.hash, public.bank_canonical_json(g.content) as canon,
      array_position(array['level', 'topic', 'sheet', 'question', 'scenario', 'region_pack'], g.kind) as kind_order
    from jsonb_to_recordset(v_items) as g(kind text, key text, position integer, content jsonb, hash text)
  ), header as (
    select g.content from jsonb_to_recordset(v_items) as g(kind text, content jsonb) where g.kind = 'level'
  ), parts (k, v) as (
    select e.key, public.bank_canonical_json(e.value) from header h, jsonb_each(h.content) e
    where e.key not in ('topics', 'sheets', 'questions', 'scenarios', 'regionPacks')
    union all
    select l.list, '[' || coalesce((select string_agg(g.canon, ',' order by g.position) from given g where g.kind = l.kind), '') || ']'
    from (values ('topics', 'topic'), ('sheets', 'sheet'), ('questions', 'question'), ('scenarios', 'scenario'), ('regionPacks', 'region_pack')) l(list, kind)
    where l.kind in ('topic', 'sheet') or exists (select 1 from header h where h.content ? 'defaultRegion')
  )
  select
    (select string_agg(format('%s "%s"', g.kind, g.key), ', ' order by g.kind_order, g.position) from given g
      where encode(sha256(convert_to(g.canon, 'UTF8')), 'hex') is distinct from g.hash),
    (select encode(sha256(convert_to(public.bank_canonical_json(coalesce(jsonb_agg(jsonb_build_object('kind', g.kind, 'key', g.key, 'position', g.position, 'hash', g.hash)
      order by g.kind_order, g.position), '[]'::jsonb)), 'UTF8')), 'hex') from given g),
    (select encode(sha256(convert_to('{' || string_agg(to_jsonb(p.k)::text || ':' || p.v, ','
      order by public.bank_json_key_index(p.k) is null, public.bank_json_key_index(p.k), public.bank_json_utf16_sort_key(p.k) collate "C") || '}', 'UTF8')), 'hex') from parts p)
  into v_problem, v_manifest, v_content;
  if v_problem is not null then
    raise exception 'bank level %: the hash of these snapshot items is not the hash of their content: %', v_level_id, v_problem using errcode = 'PT409';
  end if;
  if v_manifest is distinct from p_freeze->>'manifestHash' then
    raise exception 'bank level %: the manifest hash is not the hash of the snapshot items', v_level_id using errcode = 'PT409';
  end if;
  if v_content is distinct from p_freeze->>'contentHash' then
    raise exception 'bank level %: the content hash is not the hash of the snapshot', v_level_id using errcode = 'PT409';
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

-- The import retires missing draft rows. Protect their keys and revisions from deletion or truncation.
revoke delete, truncate on public.bank_levels, public.bank_topics, public.bank_sheets, public.bank_questions,
  public.bank_scenarios, public.bank_region_packs from service_role;

-- The service role reads snapshots and reads and adds reviews; only bank_freeze_level (as the owner) writes snapshots.
revoke all on public.bank_snapshots, public.bank_snapshot_items from service_role;
grant select on public.bank_snapshots, public.bank_snapshot_items to service_role;
revoke all on public.bank_reviews from service_role;
grant select, insert on public.bank_reviews to service_role;

revoke all on function public.bank_json_key_index(text) from public, anon, authenticated;
grant execute on function public.bank_json_key_index(text) to service_role;
revoke all on function public.bank_json_utf16_sort_key(text) from public, anon, authenticated;
grant execute on function public.bank_json_utf16_sort_key(text) to service_role;
revoke all on function public.bank_canonical_json(jsonb) from public, anon, authenticated;
grant execute on function public.bank_canonical_json(jsonb) to service_role;
revoke all on function public.bank_require_new_revision() from public, anon, authenticated;
grant execute on function public.bank_require_new_revision() to service_role;
revoke all on function public.bank_freeze_level(jsonb) from public, anon, authenticated;
grant execute on function public.bank_freeze_level(jsonb) to service_role;
