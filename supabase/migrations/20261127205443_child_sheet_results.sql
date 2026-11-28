-- UNI-243 (B3): the results of a child's v2 sheets, kept per child and rebuilt when a mark changes (architecture spec
-- 9.3, docs/workbook-v2-results.md). Additive only; no v1 table or function changes.
--   * child_sheet_results: one row per issued sheet attempt of a v2 book: the questions scored, the mistakes, the result
--     (mastered, repeat, unknown) and the marks version it was computed from. A rebuild from an older marks version
--     never replaces a newer one (write_child_sheet_results skips it; a trigger refuses it on any other write).
--   * child_bank_state: only what cannot be computed: the child's start sheet in a level, the level-test state and the
--     parent's request for more or fewer pages. Position is never stored (position() computes it).
--   * Family deletion and child deletion remove both through cascades; both have the family and child write fences.
--   * Admins read; only the service role writes. Browser roles have no write grant.

create table public.child_sheet_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  workbook_id uuid not null,
  printed_revision text not null check (printed_revision ~ '^[0-9a-f]{28}$'),
  sheet_id text not null check (char_length(sheet_id) between 1 and 120),
  attempt integer not null check (attempt between 1 and 1000),
  items_total integer not null check (items_total between 1 and 1000),
  items_scored integer not null check (items_scored between 0 and items_total),
  mistakes integer not null check (mistakes between 0 and items_scored),
  result text not null check (result in ('mastered', 'repeat', 'unknown')),
  marks_version bigint not null check (marks_version >= 0),
  constraint child_sheet_results_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade,
  constraint child_sheet_results_workbook_fkey foreign key (workbook_id, parent_id) references public.workbooks (id, parent_id) on delete cascade,
  constraint child_sheet_results_workbook_child_fkey foreign key (workbook_id, child_id) references public.workbooks (id, child_id) on delete cascade,
  constraint child_sheet_results_sheet_fkey foreign key (workbook_id, sheet_id, attempt) references public.workbook_sheets (workbook_id, sheet_id, attempt) on delete cascade,
  constraint child_sheet_results_attempt_key unique (child_id, sheet_id, attempt)
);
create index child_sheet_results_parent_idx on public.child_sheet_results (parent_id);
create index child_sheet_results_workbook_idx on public.child_sheet_results (workbook_id, sheet_id, attempt);

create table public.child_bank_state (
  child_id uuid not null,
  parent_id uuid not null references public.parents (id) on delete cascade,
  level_id text not null check (level_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  start_sheet_id text check (char_length(start_sheet_id) between 1 and 120),
  level_test_state text not null default 'not-due' check (level_test_state in ('not-due', 'due', 'issued', 'passed', 'failed')),
  pages_request text not null default 'same' check (pages_request in ('fewer', 'same', 'more')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (child_id, level_id),
  constraint child_bank_state_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index child_bank_state_parent_idx on public.child_bank_state (parent_id);

-- A sheet result never goes back to an older marks version, whoever writes it.
create function public.child_sheet_results_monotonic()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.marks_version < old.marks_version then
    raise exception 'child sheet result %: marks version % is older than %', old.id, new.marks_version, old.marks_version using errcode = 'PT409';
  end if;
  if (new.parent_id, new.child_id, new.sheet_id, new.attempt) is distinct from (old.parent_id, old.child_id, old.sheet_id, old.attempt) then
    raise exception 'child sheet result %: its child and sheet attempt cannot change', old.id using errcode = '55000';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger child_sheet_results_monotonic before update on public.child_sheet_results for each row execute function public.child_sheet_results_monotonic();

create function public.child_bank_state_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger child_bank_state_touch before update on public.child_bank_state for each row execute function public.child_bank_state_touch();

-- The family and child write fences.
create trigger fence_family_write before insert or update on public.child_sheet_results for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.child_sheet_results for each row execute function public.fence_child_delete_write();
create trigger fence_family_write before insert or update on public.child_bank_state for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.child_bank_state for each row execute function public.fence_child_delete_write();

alter table public.child_sheet_results enable row level security;
alter table public.child_bank_state enable row level security;
revoke all on public.child_sheet_results, public.child_bank_state from public, anon, authenticated;
grant select on public.child_sheet_results, public.child_bank_state to authenticated;
grant all on public.child_sheet_results, public.child_bank_state to service_role;
create policy "Admins read child sheet results" on public.child_sheet_results for select to authenticated using ((select public.is_admin()));
create policy "Admins read child bank state" on public.child_bank_state for select to authenticated using ((select public.is_admin()));

-- Writes the sheet results of one child that a rebuild computed from `p_marks_version`, in one transaction. A row whose
-- stored marks version is newer is left as it is and counted as stale; the same version again writes the row again.
-- Rebuilds of one child run one at a time. A row of a sheet attempt that no v2 book issued to the child is refused.
create function public.write_child_sheet_results(p_child uuid, p_marks_version bigint, p_results jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w_parent uuid;
  r jsonb;
  w_count integer;
  w_written integer := 0;
  w_stale integer := 0;
begin
  if p_marks_version is null or p_marks_version < 0 then
    return jsonb_build_object('status', 'refused', 'reason', 'the marks version must be a whole number, 0 or more');
  end if;
  if jsonb_typeof(p_results) is distinct from 'array' then
    return jsonb_build_object('status', 'refused', 'reason', 'the results must be a list');
  end if;
  select parent_id into w_parent from public.children where id = p_child;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'the child is not known'); end if;
  perform pg_advisory_xact_lock(hashtextextended('child-sheet-results:' || p_child::text, 0));
  for r in select value from jsonb_array_elements(p_results) loop
    insert into public.child_sheet_results as c (parent_id, child_id, workbook_id, printed_revision, sheet_id, attempt, items_total, items_scored, mistakes, result, marks_version)
    values (w_parent, p_child, (r->>'workbookId')::uuid, r->>'printedRevision', r->>'sheetId', (r->>'attempt')::int, (r->>'itemsTotal')::int,
      (r->>'itemsScored')::int, (r->>'mistakes')::int, r->>'result', p_marks_version)
    on conflict (child_id, sheet_id, attempt) do update set
      workbook_id = excluded.workbook_id, printed_revision = excluded.printed_revision, items_total = excluded.items_total,
      items_scored = excluded.items_scored, mistakes = excluded.mistakes, result = excluded.result, marks_version = excluded.marks_version
      where c.marks_version <= excluded.marks_version;
    get diagnostics w_count = row_count;
    if w_count = 1 then w_written := w_written + 1; else w_stale := w_stale + 1; end if;
  end loop;
  return jsonb_build_object('status', 'written', 'written', w_written, 'stale', w_stale,
    'marksVersion', (select max(marks_version) from public.child_sheet_results where child_id = p_child));
exception
  when foreign_key_violation or check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('status', 'refused', 'reason', format('the results do not pass the database check (%s)', sqlerrm));
end $$;
revoke all on function public.write_child_sheet_results(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.write_child_sheet_results(uuid, bigint, jsonb) to service_role;
revoke all on function public.child_sheet_results_monotonic() from public, anon, authenticated;
revoke all on function public.child_bank_state_touch() from public, anon, authenticated;
