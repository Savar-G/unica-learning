-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_answer_timeline, 2026-10-16.
-- The answer timeline (#184, spec #181). The server records when it first serves each question (question_shows, one
-- row per place in a test) and, with each answer, when its question was served and when the answer arrived. Each answer
-- also keeps what the child did before Next, as the browser measured it from when the question appeared: the answer
-- changes, the read-aloud uses and the time away from the tab. The bounds match src/lib/answer-events.ts.
-- The server writes with the secret key (service_role skips row-level security); admins read; parents get nothing.
-- A family deletion removes the rows with the test (cascade), and the family write fence covers new rows.
-- Additive: new nullable columns and a new table. Answers stored before this have nulls; no code on main reads or
-- writes them.

alter table public.answers
  add column shown_at timestamptz,
  add column answered_at timestamptz,
  -- [{"value": "12", "atMs": 4000}, ...]: the first 50 changes of the answer, in order.
  add column answer_changes jsonb check (
    answer_changes is null
    or case when jsonb_typeof(answer_changes) = 'array'
      then jsonb_array_length(answer_changes) <= 50 and pg_column_size(answer_changes) < 16000
      else false end
  ),
  -- "Read it to me": how many times the child started it, and the first 20 times (ms since the question appeared).
  add column read_aloud_count integer check (read_aloud_count between 0 and 1000),
  add column read_aloud_at_ms integer[] check (
    cardinality(read_aloud_at_ms) <= 20 and 0 <= all (read_aloud_at_ms) and 3600000 >= all (read_aloud_at_ms)
  ),
  -- Time away from the tab: how many times the tab was hidden, and for how long in total (capped at an hour).
  add column away_count integer check (away_count between 0 and 1000),
  add column away_ms integer check (away_ms between 0 and 3600000);

create table public.question_shows (
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  -- The question's place in the test, from 0, as answers.position. The first serve wins (insert on conflict do nothing).
  position smallint not null check (position between 0 and 99),
  question_id text not null check (char_length(question_id) <= 40),
  shown_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (assessment_id, position)
);

alter table public.question_shows enable row level security;
revoke all on table public.question_shows from anon, authenticated;
grant select on table public.question_shows to authenticated;
create policy "Admins read all question shows" on public.question_shows
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.question_shows
  for each row execute function public.fence_family_write();
