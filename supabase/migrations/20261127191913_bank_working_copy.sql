-- UNI-241 (B1): the working copy of the bank (architecture spec 9.2, docs/workbook-v2-bank.md). Additive only.
--   * bank_levels, bank_topics, bank_sheets, bank_questions, bank_scenarios, bank_region_packs: one working copy per
--     level. The bank import command writes draft rows; nothing is deleted (a removed item is retired).
--   * `basis` (the note about a source) is always a column of its own, never inside `content`.
--   * bank_write_level: writes one level in one transaction, and refuses a write made from a stale read.
--   * Service-role only: browser roles (anon, authenticated) have no grants and no policies.
-- bank_reference_images and bank_reference_topic_methods do not change.

create table public.bank_levels (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  display_name text not null check (char_length(display_name) between 1 and 8),
  position integer not null check (position >= 0),
  status text not null default 'draft' check (status in ('draft', 'live', 'retired')),
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object'),
  basis jsonb check (basis is null or jsonb_typeof(basis) = 'object'),
  default_region text check (default_region ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,63}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bank_topics (
  level_id text not null references public.bank_levels (id),
  id text not null check (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  code text not null check (char_length(code) between 1 and 8),
  position integer not null check (position >= 0),
  title text not null check (char_length(title) between 1 and 200),
  child_title text check (char_length(child_title) between 1 and 200),
  standards_tags text[] not null default '{}',
  basis jsonb check (basis is null or jsonb_typeof(basis) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (level_id, id)
);

-- sheet_id is opaque and stable across levels: marks and results name a sheet by it alone.
create table public.bank_sheets (
  sheet_id text primary key check (sheet_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  level_id text not null,
  topic_id text not null,
  position integer not null check (position >= 0),
  first_page bigint not null check (first_page >= 1),
  kind text not null check (kind in ('example', 'practice', 'word', 'test')),
  content jsonb not null check (jsonb_typeof(content) = 'object' and not jsonb_path_exists(content, 'lax $.**.basis')),
  basis jsonb not null default '{}' check (jsonb_typeof(basis) = 'object'),
  revision integer not null default 1 check (revision >= 1),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (level_id, topic_id) references public.bank_topics (level_id, id)
);
create index bank_sheets_level_idx on public.bank_sheets (level_id);

create table public.bank_questions (
  level_id text not null references public.bank_levels (id),
  id text not null check (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  position integer not null check (position >= 0),
  scenario_kind text not null check (char_length(scenario_kind) between 1 and 64),
  regions text[],
  slots jsonb not null check (jsonb_typeof(slots) = 'object'),
  unit text not null check (char_length(unit) between 1 and 80),
  solver jsonb not null,
  difficulty bigint not null check (difficulty >= 1),
  phrasings jsonb not null check (jsonb_typeof(phrasings) = 'array'),
  basis jsonb check (basis is null or jsonb_typeof(basis) = 'object'),
  revision integer not null default 1 check (revision >= 1),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (level_id, id)
);

create table public.bank_scenarios (
  level_id text not null references public.bank_levels (id),
  id text not null check (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  position integer not null check (position >= 0),
  interest text not null check (char_length(interest) between 1 and 64),
  level_band text check (char_length(level_band) between 1 and 40),
  kind text not null check (char_length(kind) between 1 and 64),
  content jsonb not null check (jsonb_typeof(content) = 'object' and not (content ? 'basis')),
  basis jsonb check (basis is null or jsonb_typeof(basis) = 'object'),
  revision integer not null default 1 check (revision >= 1),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (level_id, id)
);

create table public.bank_region_packs (
  level_id text not null references public.bank_levels (id),
  id text not null check (id ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,63}$'),
  position integer not null check (position >= 0),
  units jsonb not null check (jsonb_typeof(units) = 'object'),
  coins jsonb not null check (jsonb_typeof(coins) = 'object'),
  spelling jsonb not null check (jsonb_typeof(spelling) = 'object'),
  clock_format text check (char_length(clock_format) between 1 and 40),
  date_format text check (char_length(date_format) between 1 and 40),
  grade_names jsonb check (grade_names is null or jsonb_typeof(grade_names) = 'object'),
  basis jsonb check (basis is null or jsonb_typeof(basis) = 'object'),
  revision integer not null default 1 check (revision >= 1),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (level_id, id)
);

alter table public.bank_levels enable row level security;
alter table public.bank_topics enable row level security;
alter table public.bank_sheets enable row level security;
alter table public.bank_questions enable row level security;
alter table public.bank_scenarios enable row level security;
alter table public.bank_region_packs enable row level security;
revoke all on public.bank_levels, public.bank_topics, public.bank_sheets, public.bank_questions, public.bank_scenarios, public.bank_region_packs from anon, authenticated;
grant all on public.bank_levels, public.bank_topics, public.bank_sheets, public.bank_questions, public.bank_scenarios, public.bank_region_packs to service_role;

-- One level in one transaction. p_write: { expected, level, topics, sheets, questions, scenarios, regionPacks }, where
-- each list holds only the rows that change and `expected` is bank_levels.updated_at as it was read (null for a new
-- level). A write made from a stale read, or a sheet id that another level owns, is refused and writes nothing.
create function public.bank_write_level(p_write jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_level public.bank_levels := jsonb_populate_record(null::public.bank_levels, p_write->'level');
  v_expected timestamptz := (p_write->>'expected')::timestamptz;
  v_current timestamptz;
  v_now timestamptz := clock_timestamp();
  v_taken text;
begin
  if v_level.id is null then
    raise exception 'bank_write_level: the level has no id' using errcode = '22023';
  end if;
  select updated_at into v_current from public.bank_levels where id = v_level.id for update;
  if not found then
    if v_expected is not null then
      raise exception 'bank level %: it changed since it was read', v_level.id using errcode = '40001';
    end if;
    insert into public.bank_levels (id, display_name, position, status, config, basis, default_region, updated_at)
    values (v_level.id, v_level.display_name, v_level.position, coalesce(v_level.status, 'draft'), coalesce(v_level.config, '{}'), v_level.basis, v_level.default_region, v_now);
  else
    if v_expected is null or v_current <> v_expected then
      raise exception 'bank level %: it changed since it was read', v_level.id using errcode = '40001';
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

  return jsonb_build_object('version', v_now);
end $$;

revoke all on function public.bank_write_level(jsonb) from public, anon, authenticated;
grant execute on function public.bank_write_level(jsonb) to service_role;
