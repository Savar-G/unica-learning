-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_work_reviews, 2026-10-11.
-- AI reviews of the child's shown work (#68, D-084): one row per reviewed piece of work. Additive: a new table that the
-- code on main does not read. The background report job (src/lib/report-job.ts) writes it with the secret key
-- (service_role skips row-level security) before it builds the report, and only when the AI is on (ANTHROPIC_API_KEY).
--
-- Parents get no access, not even to their own rows: the report model (reports.model) already carries every comment a
-- parent sees, and only the sure ones. A low-confidence comment must never reach a parent. The admin area (#77) reads
-- every review with its confidence, and filters on confidence = 'low'.
--
-- error_type: a short label, "none" when there is no error. kind: slip, misunderstanding, or none (a right answer).
-- comment: the AI's comment, tidied. score: the reviewer's own confidence, 0 to 1. confidence: 'high' when the report may
-- show the comment (score at least 0.8, the comment passes the text rules, and the review agrees with the mark); else
-- 'low', and the report shows the work alone. model: the Claude model id that wrote it. The review never changes the mark.
create table public.work_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  parent_id uuid not null references public.parents (id) on delete cascade,
  question_id text not null check (char_length(question_id) <= 40),
  error_type text not null check (char_length(error_type) <= 60),
  kind text not null check (kind in ('slip', 'misunderstanding', 'none')),
  comment text not null check (char_length(comment) <= 2000),
  score numeric(4, 3) not null check (score >= 0 and score <= 1),
  confidence text not null check (confidence in ('high', 'low')),
  model text not null check (char_length(model) <= 80),
  unique (assessment_id, question_id)
);
create index work_reviews_parent_id_idx on public.work_reviews (parent_id);
create index work_reviews_low_idx on public.work_reviews (created_at) where confidence = 'low';

alter table public.work_reviews enable row level security;
revoke all on table public.work_reviews from anon, authenticated;
