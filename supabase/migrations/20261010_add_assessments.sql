-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_assessments, 2026-10-10.
-- Online assessment tests and their answers (#64, D-083). The server writes both tables with the secret key
-- (service_role skips row-level security) and marks every answer with the assessment core (src/lib/assessment).
-- test: the drawn questions with their answers and coded wrong answers. The browser must never see it, so a parent
-- can read only the listed columns of their own assessments, never test or seed. answers: no reads for parents yet;
-- the report (#65) and admin (#77) tickets add them. anon gets nothing.
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  seed integer not null check (seed >= 0),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'expired')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  -- The child's grade and province when the test started; the child's row can change later.
  grade smallint not null check (grade between 1 and 7),
  province text not null check (province in ('BC', 'AB', 'SK', 'MB', 'ON', 'other')),
  test jsonb not null,
  route text check (route in ('up', 'stay', 'down')),
  placement jsonb,
  check ((status = 'completed') = (completed_at is not null and placement is not null))
);
create index assessments_child_id_idx on public.assessments (child_id, created_at);
create index assessments_parent_id_idx on public.assessments (parent_id);
-- One open test per child, so a double click cannot start two.
create unique index assessments_one_open_per_child on public.assessments (child_id) where status = 'in_progress';

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  -- 0-based order in the test. Unique, so two answers sent at once cannot both take the same question.
  position smallint not null check (position between 0 and 99),
  question_id text not null check (char_length(question_id) <= 40),
  template_id text not null check (char_length(template_id) <= 80),
  "values" jsonb not null check (pg_column_size("values") < 2000),
  response text not null check (char_length(response) <= 40),
  correct boolean not null,
  misconception text check (char_length(misconception) <= 20),
  time_ms integer not null check (time_ms >= 0),
  unique (assessment_id, position)
);

alter table public.assessments enable row level security;
alter table public.answers enable row level security;
revoke all on table public.assessments, public.answers from anon, authenticated;
grant select (id, created_at, child_id, status, started_at, completed_at, grade, province, route, placement)
  on table public.assessments to authenticated;
create policy "Parents read their own assessments" on public.assessments
  for select to authenticated using ((select auth.uid()) = parent_id);
