-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_learning_events, 2026-10-29 (Supabase MCP,
-- registry 20261030030641).
-- Learning events (#302, spec #295): one append-only record shape for every signal about a child's learning, written by
-- Maya's calls, by marked pages and from assessment answers (src/lib/learning-events.ts). Every raw event is kept: no
-- row is changed after it is written, and none is filtered at write time.
-- Only the server writes, with the secret key (service_role skips row-level security). Admins read. Parents read
-- nothing, not even their own child's rows: the later per-child profile reads the events for them.
-- The service role may only insert and read: it has no update, delete or truncate grant, and a trigger refuses every
-- update, from any role. A family deletion removes the rows through the foreign keys (on delete cascade from the
-- parent, the child and the test), which run as the table owner; the family write fence covers new rows.
-- Additive: one new table, and two unique constraints on columns that are already unique (the primary key with one more
-- column), which the composite foreign keys need. The code on main does not read or write the table.
--
-- idempotency_key: the writer's id for the logical event ("assessment-answer:<answer id>"); a retried write of the
--   same event finds the stored one (unique). question_*: the question reference of the question package (#298): a
--   workbook question (workbook id, page number, question number) or an assessment question (test id, question id).
--   The workbook id has no foreign key yet: the workbook store (#299) adds it. skill_standard / skills: the BC
--   standard code and the ids of its smaller skills. stuck_step: the worked step id where the child got stuck
--   ("tens"). mistake: the cause id of the known wrong answer the child gave ("O3"). evidence_kind / evidence_id:
--   the call, the scan or the assessment answer the event comes from.
alter table public.children add constraint children_id_parent_key unique (id, parent_id);
alter table public.assessments add constraint assessments_id_child_key unique (id, child_id);

create table public.learning_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 200),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  source text not null check (source in ('call', 'marking', 'assessment')),
  question_source text not null check (question_source in ('workbook', 'assessment')),
  workbook_id uuid,
  workbook_page integer check (workbook_page between 1 and 9999),
  workbook_question integer check (workbook_question between 1 and 9999),
  assessment_id uuid references public.assessments (id) on delete cascade,
  assessment_question_id text check (length(assessment_question_id) between 1 and 40),
  skill_standard text not null check (length(skill_standard) between 1 and 20),
  skills text[] not null default '{}' check (cardinality(skills) <= 20),
  result text not null check (result in ('right', 'wrong', 'blank', 'right_with_help')),
  stuck_step text check (length(stuck_step) between 1 and 40),
  mistake text check (length(mistake) between 1 and 40),
  hints smallint not null default 0 check (hints between 0 and 100),
  time_ms integer check (time_ms between 0 and 86400000),
  occurred_at timestamptz not null,
  evidence_kind text check (evidence_kind in ('call', 'scan', 'answer')),
  evidence_id text check (length(evidence_id) between 1 and 100),
  foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade,
  foreign key (assessment_id, child_id) references public.assessments (id, child_id) on delete cascade,
  check (
    (question_source = 'workbook' and workbook_id is not null and workbook_page is not null and workbook_question is not null
      and assessment_id is null and assessment_question_id is null)
    or (question_source = 'assessment' and assessment_id is not null and assessment_question_id is not null
      and workbook_id is null and workbook_page is null and workbook_question is null)
  ),
  check (source <> 'assessment' or question_source = 'assessment'),
  check (mistake is null or result = 'wrong'),
  check (stuck_step is null or result <> 'right'),
  check ((evidence_kind is null) = (evidence_id is null))
);
create index learning_events_child_time_idx on public.learning_events (child_id, occurred_at, id);
create index learning_events_parent_idx on public.learning_events (parent_id);
create index learning_events_assessment_idx on public.learning_events (assessment_id) where assessment_id is not null;

alter table public.learning_events enable row level security;
revoke all on table public.learning_events from anon, authenticated, service_role;
grant select, insert on table public.learning_events to service_role;
grant select on table public.learning_events to authenticated;
create policy "Admins read learning events" on public.learning_events
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.learning_events
  for each row execute function public.fence_family_write();

-- Append only: no role changes a stored event.
create function public.refuse_learning_event_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'learning events are append only' using errcode = '55000';
end $$;
revoke all on function public.refuse_learning_event_update() from public, anon, authenticated;
create trigger refuse_update before update on public.learning_events
  for each row execute function public.refuse_learning_event_update();
