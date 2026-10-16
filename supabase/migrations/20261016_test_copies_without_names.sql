-- The copy without names (#201, spec #181, D-119). Apply before the code that needs it ships, and after every migration
-- it reads: the learner profiles, the test context, the answer timeline and strokes, the break length, the learning
-- questions, the extra round (add_extra_round, #190) and the deletion queue with its lease. Its name sorts after all of
-- them, so a replay in filename order works; family_copy_sources is checked against those columns when it is created.
-- Before a family is deleted (a parent's request, or the retention rules: free-test and former-customer families), each
-- of its tests is copied with a random id that does not link to the family. The worker builds the copy with the
-- assessment core's allowlist (src/lib/assessment/anonymous-copy.ts) and saves it here under its deleting lease,
-- before it removes any drawing, Auth user or row. Nothing is removed until confirm_family_copies says every test of
-- the frozen family has its copy, so a failed copy stops the deletion. The copy and its link to the test are written in
-- one transaction, and the link goes with the family (cascade), so a retry after a lost answer writes no second copy.
--
-- Additive: two new tables and three new functions. No existing table, function, trigger or row changes, so the worker
-- on main keeps working against this database (it writes no copies). The new worker calls these functions on every
-- deletion and stops when one is missing (PGRST202), so it never deletes without its copy.

-- One row per copied test. No timestamp of any kind, on purpose: an exact time could be matched to records of the family
-- (for example the Auth log of its deletion). test_month is the month the test started, in UTC. test_family: a family
-- an admin marked as a test (D-099); exports leave these out unless asked. copy: the copy JSON (AnonymousTestCopy),
-- whose fields save_family_test_copy checks against the allowlist (at the top, in the extra round's record and in each
-- question).
-- Server writes (through save_family_test_copy); admins read; parents and visitors get nothing.
create table public.anonymous_tests (
  id uuid primary key default gen_random_uuid(),
  copy_version smallint not null check (copy_version >= 1),
  grade smallint not null check (grade between 1 and 7),
  province text not null check (province in ('BC', 'AB', 'SK', 'MB', 'ON', 'other')),
  test_month date not null check (extract(day from test_month) = 1),
  test_family boolean not null,
  copy jsonb not null check (jsonb_typeof(copy) = 'object' and pg_column_size(copy) < 1000000)
);

-- Which test a copy was made from, while that test exists: it makes the copy once per test. The family's deletion
-- removes the link with the test (cascade), and then nothing links the copy to the family. Server only: no client role
-- reads it, admins included. No family write fence: the family is frozen when its copy is written.
create table public.anonymous_test_links (
  assessment_id uuid primary key references public.assessments (id) on delete cascade,
  copy_id uuid not null unique references public.anonymous_tests (id) on delete cascade
);

alter table public.anonymous_tests enable row level security;
alter table public.anonymous_test_links enable row level security;
revoke all on table public.anonymous_tests, public.anonymous_test_links from anon, authenticated;
grant all on table public.anonymous_tests, public.anonymous_test_links to service_role;
grant select on table public.anonymous_tests to authenticated;
create policy "Admins read anonymous tests" on public.anonymous_tests
  for select to authenticated using ((select public.is_admin()));

-- Every test of a family, with what the copy reads and nothing more: no name, email, postal code, drawing or stroke
-- path, typed working or free text (the learning note, the profile's AI parts), and no family, child or test id but the
-- test's own (the worker needs it to save the copy once; the copy leaves it out). `copied`: the test already has its
-- copy. The extra round (#190): its four times (the copy keeps them as times since the start, never a date and time),
-- its questions in `stored` (test->'extra') and each answer's round. Read only, so the dry run uses it too. Service only.
create function public.family_copy_sources(p uuid) returns jsonb
language sql stable security definer set search_path = '' set timezone = 'UTC' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'copied', exists(select 1 from public.anonymous_test_links l where l.assessment_id = a.id),
    'testFamily', exists(select 1 from public.test_accounts t where t.parent_id = a.parent_id),
    'grade', a.grade, 'province', a.province, 'status', a.status, 'route', a.route, 'help', a.help,
    'startedAt', a.started_at, 'completedAt', a.completed_at,
    'breakStartedAt', a.break_started_at, 'breakEndedAt', a.break_ended_at, 'breakSkipped', a.break_skipped,
    'breakMs', a.break_ms, 'device', a.device,
    'extraOfferedAt', a.extra_offered_at, 'extraSkippedAt', a.extra_skipped_at, 'extraStartedAt', a.extra_started_at,
    'extraFinishedAt', a.extra_finished_at,
    'stored', a.test, 'placement', a.placement,
    'answers', (select coalesce(jsonb_agg(jsonb_build_object(
        'position', x.position, 'questionId', x.question_id, 'round', x.round, 'templateId', x.template_id, 'values', x."values",
        'response', x.response, 'correct', x.correct, 'misconception', x.misconception, 'timeMs', x.time_ms,
        'workRequired', x.work_required, 'drawing', x.work_path is not null, 'typed', x.work_text is not null,
        'strokes', x.strokes_path is not null, 'shownAt', x.shown_at, 'answeredAt', coalesce(x.answered_at, x.created_at),
        'changes', x.answer_changes, 'readAloudCount', x.read_aloud_count, 'readAloudAtMs', to_jsonb(x.read_aloud_at_ms),
        'awayCount', x.away_count, 'awayMs', x.away_ms
      ) order by x.position), '[]'::jsonb) from public.answers x where x.assessment_id = a.id),
    'shows', (select coalesce(jsonb_agg(jsonb_build_object(
        'position', s.position, 'questionId', s.question_id, 'shownAt', s.shown_at
      ) order by s.position), '[]'::jsonb) from public.question_shows s where s.assessment_id = a.id),
    'facts', (select jsonb_build_object('startedAt', f.started_at, 'stored', f.test, 'answers', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'position', y.position, 'factId', y.fact_id, 'response', y.response, 'correct', y.correct, 'atMs', y.at_ms,
          'serverMs', y.server_ms, 'browserMs', y.browser_ms
        ) order by y.position), '[]'::jsonb) from public.fact_answers y where y.assessment_id = a.id
      )) from public.assessment_facts f where f.assessment_id = a.id),
    -- The profile's facts: its AI parts (#197, free text) never leave the database.
    'profile', (select l.profile - 'ai' from public.learner_profiles l where l.assessment_id = a.id),
    'learning', (select jsonb_build_object(
        'styles', c.learning_styles, 'interests', c.interests, 'feeling', c.math_feeling, 'goal', c.learning_goal,
        'weeklyTime', c.weekly_time
      ) from public.children c where c.id = a.child_id)
  ) order by a.id), '[]'::jsonb)
  from public.assessments a where a.parent_id = p;
$$;

-- Saves one test's copy and its link, under the family's deleting lease (the phase after the payment check, which no
-- payment answer can reopen). False when the test already has its copy. The columns come from the database's own
-- values, and the copy must agree with them. The copy's fields must be the core's allowlist: at the top, in the extra
-- round's record and in each question (COPY_FIELDS.test, .extraRound and .question in src/lib/assessment/anonymous-copy.ts;
-- a test keeps the lists equal).
create function public.save_family_test_copy(p uuid, token uuid, test_id uuid, test_copy jsonb) returns boolean
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare q public.family_deletions; a public.assessments; marked boolean; extra text; made uuid;
begin
  select * into q from public.family_deletions where parent_id = p for update;
  if not found or q.phase <> 'deleting' or q.lease_token is distinct from token or q.lease_until <= now() then
    raise exception 'copy_lease_unavailable' using errcode = '55000';
  end if;
  select * into a from public.assessments where id = test_id and parent_id = p;
  if not found then raise exception 'copy_scope' using errcode = '55000'; end if;
  if exists(select 1 from public.anonymous_test_links where assessment_id = test_id) then return false; end if;
  if jsonb_typeof(test_copy) is distinct from 'object' or jsonb_typeof(test_copy->'questions') is distinct from 'array'
    or jsonb_typeof(test_copy->'extraRound') not in ('object', 'null') then
    raise exception 'copy_fields' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(test_copy->'questions') shown(v) where jsonb_typeof(shown.v) <> 'object') then
    raise exception 'copy_fields' using errcode = '22023';
  end if;
  select k into extra from (
    select k from jsonb_object_keys(test_copy) k where k <> all(array['copyVersion', 'grade', 'province', 'testMonth', 'testFamily', 'status', 'route', 'help', 'durationMs', 'break', 'device', 'placement', 'questions', 'extraRound', 'facts', 'profile', 'questionnaire'])
    union all
    select k from jsonb_object_keys(case when jsonb_typeof(test_copy->'extraRound') = 'object' then test_copy->'extraRound' else '{}'::jsonb end) k
      where k <> all(array['takenFrom', 'offeredAtMs', 'skippedAtMs', 'startedAtMs', 'stoppedAtMs', 'finishedAtMs', 'questions', 'counted'])
    union all
    select k from jsonb_array_elements(test_copy->'questions') shown(v), jsonb_object_keys(shown.v) k where k <> all(array['position', 'questionId', 'round', 'templateId', 'standard', 'wording', 'level', 'strand', 'format', 'prompt', 'choices', 'figure', 'values', 'answer', 'showWork', 'shownAtMs', 'answeredAtMs', 'response', 'correct', 'misconception', 'timeMs', 'changes', 'readAloud', 'away', 'work'])
  ) listed limit 1;
  if extra is not null then raise exception 'copy_fields' using errcode = '22023'; end if;
  marked := exists(select 1 from public.test_accounts where parent_id = p);
  if test_copy->'grade' is distinct from to_jsonb(a.grade) or test_copy->'province' is distinct from to_jsonb(a.province)
    or test_copy->'testMonth' is distinct from to_jsonb(to_char(a.started_at, 'YYYY-MM'))
    or test_copy->'testFamily' is distinct from to_jsonb(marked) then
    raise exception 'copy_mismatch' using errcode = '22023';
  end if;
  insert into public.anonymous_tests(copy_version, grade, province, test_month, test_family, copy)
    values ((test_copy->>'copyVersion')::smallint, a.grade, a.province, date_trunc('month', a.started_at)::date, marked, test_copy)
    returning id into made;
  insert into public.anonymous_test_links(assessment_id, copy_id) values (test_id, made);
  return true;
end $$;

-- True when every test of the family has its copy, under the same lease. The worker removes nothing before this.
create function public.confirm_family_copies(p uuid, token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare q public.family_deletions;
begin
  select * into q from public.family_deletions where parent_id = p for share;
  if not found or q.phase <> 'deleting' or q.lease_token is distinct from token or q.lease_until <= now() then return false; end if;
  return not exists(select 1 from public.assessments a where a.parent_id = p
    and not exists(select 1 from public.anonymous_test_links l where l.assessment_id = a.id));
end $$;

revoke all on function public.family_copy_sources(uuid), public.save_family_test_copy(uuid, uuid, uuid, jsonb),
  public.confirm_family_copies(uuid, uuid) from public, anon, authenticated;
grant execute on function public.family_copy_sources(uuid), public.save_family_test_copy(uuid, uuid, uuid, jsonb),
  public.confirm_family_copies(uuid, uuid) to service_role;
