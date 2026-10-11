-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_assessment_facts, 2026-10-11.
-- The timed facts section of a test (#70). Additive: two new tables, nothing else changes.
-- assessment_facts: one row per test, written when the child presses Start. started_at is the server's clock;
-- the section ends FACTS_SECONDS after it, so the browser clock never decides the time. test: the drawn facts.
-- fact_answers: one row per fact, in order. at_ms is the server's time since started_at when the answer arrived.
-- Only the server reads and writes them (secret key; service_role skips row-level security). The result goes into
-- assessments.placement when the test finishes, so parents never need these rows. anon and authenticated get nothing.
create table public.assessment_facts (
  assessment_id uuid primary key references public.assessments (id) on delete cascade,
  created_at timestamptz not null default now(),
  started_at timestamptz not null,
  test jsonb not null check (pg_column_size(test) < 20000)
);

create table public.fact_answers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  assessment_id uuid not null references public.assessment_facts (assessment_id) on delete cascade,
  -- 0-based order in the section. Unique, so two answers sent at once cannot both take the same fact.
  position smallint not null check (position between 0 and 199),
  fact_id text not null check (char_length(fact_id) <= 20),
  -- Empty means the child skipped the fact.
  response text not null check (char_length(response) <= 4),
  correct boolean not null,
  at_ms integer not null check (at_ms >= 0),
  unique (assessment_id, position)
);

alter table public.assessment_facts enable row level security;
alter table public.fact_answers enable row level security;
revoke all on table public.assessment_facts, public.fact_answers from anon, authenticated;
