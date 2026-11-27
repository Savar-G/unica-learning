-- UNI-241 (B1): restore transaction-local unica.in_bank_write_level setting before bank_write_level returns,
-- so a later direct child-row edit in the same transaction still fires bank_touch_level_version.

create or replace function public.bank_write_level(p_write jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_prev_flag text := current_setting('unica.in_bank_write_level', true);
  v_level public.bank_levels := jsonb_populate_record(null::public.bank_levels, p_write->'level');
  v_expected timestamptz := (p_write->>'expected')::timestamptz;
  v_current timestamptz;
  v_now timestamptz;
  v_taken text;
  v_sheet_count integer := jsonb_array_length(coalesce(p_write->'sheets', '[]'));
  v_written_sheets integer := 0;
begin
  if v_level.id is null then
    raise exception 'bank_write_level: the level has no id' using errcode = '22023';
  end if;
  perform set_config('unica.in_bank_write_level', '1', true);
  begin
    select updated_at into v_current from public.bank_levels where id = v_level.id for update;
    v_now := greatest(clock_timestamp(), coalesce(v_current + interval '1 microsecond', clock_timestamp()));
    if not found then
      if v_expected is not null then
        raise exception 'bank level %: it changed since it was read', v_level.id using errcode = 'PT409';
      end if;
      insert into public.bank_levels (id, display_name, position, status, config, basis, default_region, updated_at)
      values (v_level.id, v_level.display_name, v_level.position, coalesce(v_level.status, 'draft'), coalesce(v_level.config, '{}'), v_level.basis, v_level.default_region, v_now);
    else
      if v_expected is null or v_current <> v_expected then
        raise exception 'bank level %: it changed since it was read', v_level.id using errcode = 'PT409';
      end if;
      update public.bank_levels
      set display_name = v_level.display_name, position = v_level.position, status = coalesce(v_level.status, 'draft'), config = coalesce(v_level.config, '{}'),
        basis = v_level.basis, default_region = v_level.default_region, updated_at = v_now
      where id = v_level.id;
    end if;

    select string_agg(s.sheet_id, ', ' order by s.sheet_id) into v_taken
    from jsonb_populate_recordset(null::public.bank_sheets, coalesce(p_write->'sheets', '[]')) r
    join public.bank_sheets s on s.sheet_id = r.sheet_id
    where s.level_id <> v_level.id;
    if v_taken is not null then
      raise exception 'bank level %: the sheet ids % belong to another level', v_level.id, v_taken using errcode = '23505';
    end if;

    insert into public.bank_topics (level_id, id, code, position, title, child_title, standards_tags, basis, status, updated_at)
    select v_level.id, r.id, r.code, r.position, r.title, r.child_title, coalesce(r.standards_tags, '{}'), r.basis, r.status, v_now
    from jsonb_populate_recordset(null::public.bank_topics, coalesce(p_write->'topics', '[]')) r
    on conflict (level_id, id) do update set code = excluded.code, position = excluded.position, title = excluded.title, child_title = excluded.child_title,
      standards_tags = excluded.standards_tags, basis = excluded.basis, status = excluded.status, updated_at = excluded.updated_at;

    insert into public.bank_region_packs (level_id, id, position, units, coins, spelling, clock_format, date_format, grade_names, basis, revision, status, updated_at)
    select v_level.id, r.id, r.position, r.units, r.coins, r.spelling, r.clock_format, r.date_format, r.grade_names, r.basis, r.revision, r.status, v_now
    from jsonb_populate_recordset(null::public.bank_region_packs, coalesce(p_write->'regionPacks', '[]')) r
    on conflict (level_id, id) do update set position = excluded.position, units = excluded.units, coins = excluded.coins, spelling = excluded.spelling,
      clock_format = excluded.clock_format, date_format = excluded.date_format, grade_names = excluded.grade_names, basis = excluded.basis,
      revision = excluded.revision, status = excluded.status, updated_at = excluded.updated_at;

    insert into public.bank_scenarios (level_id, id, position, interest, level_band, kind, content, basis, revision, status, updated_at)
    select v_level.id, r.id, r.position, r.interest, r.level_band, r.kind, r.content, r.basis, r.revision, r.status, v_now
    from jsonb_populate_recordset(null::public.bank_scenarios, coalesce(p_write->'scenarios', '[]')) r
    on conflict (level_id, id) do update set position = excluded.position, interest = excluded.interest, level_band = excluded.level_band, kind = excluded.kind,
      content = excluded.content, basis = excluded.basis, revision = excluded.revision, status = excluded.status, updated_at = excluded.updated_at;

    insert into public.bank_questions (level_id, id, position, scenario_kind, regions, slots, unit, solver, difficulty, phrasings, basis, revision, status, updated_at)
    select v_level.id, r.id, r.position, r.scenario_kind, r.regions, r.slots, r.unit, r.solver, r.difficulty, r.phrasings, r.basis, r.revision, r.status, v_now
    from jsonb_populate_recordset(null::public.bank_questions, coalesce(p_write->'questions', '[]')) r
    on conflict (level_id, id) do update set position = excluded.position, scenario_kind = excluded.scenario_kind, regions = excluded.regions, slots = excluded.slots,
      unit = excluded.unit, solver = excluded.solver, difficulty = excluded.difficulty, phrasings = excluded.phrasings, basis = excluded.basis,
      revision = excluded.revision, status = excluded.status, updated_at = excluded.updated_at;

    insert into public.bank_sheets (sheet_id, level_id, topic_id, position, first_page, kind, content, basis, revision, status, updated_at)
    select r.sheet_id, v_level.id, r.topic_id, r.position, r.first_page, r.kind, r.content, coalesce(r.basis, '{}'), r.revision, r.status, v_now
    from jsonb_populate_recordset(null::public.bank_sheets, coalesce(p_write->'sheets', '[]')) r
    on conflict (sheet_id) do update set topic_id = excluded.topic_id, position = excluded.position, first_page = excluded.first_page, kind = excluded.kind,
      content = excluded.content, basis = excluded.basis, revision = excluded.revision, status = excluded.status, updated_at = excluded.updated_at
    where public.bank_sheets.level_id = excluded.level_id;

    get diagnostics v_written_sheets = row_count;
    if v_written_sheets <> v_sheet_count then
      raise exception 'bank level %: one or more sheet ids belong to another level', v_level.id using errcode = '23505';
    end if;

    perform set_config('unica.in_bank_write_level', coalesce(v_prev_flag, ''), true);
  exception when others then
    perform set_config('unica.in_bank_write_level', coalesce(v_prev_flag, ''), true);
    raise;
  end;

  return jsonb_build_object('version', v_now);
end $$;

revoke all on function public.bank_write_level(jsonb) from public, anon, authenticated;
grant execute on function public.bank_write_level(jsonb) to service_role;
