-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_reports, 2026-10-11.
-- The parent's report for a finished test (#65, D-084, D-087): one row per completed assessment. The background job
-- that runs after the finish route (src/lib/report-job.ts) writes it with the secret key (service_role skips
-- row-level security).
-- model: the report model of the assessment core (src/lib/assessment, reportModel). The report page and the report
-- email both show it. A signed-in parent reads only the listed columns of their own reports. anon gets nothing.
-- Admin reads come with the admin ticket (#77).
-- emailed_at, alerted_at: the job claims each email by setting its time before it sends, so two jobs never send the
-- same email twice. A failed send clears the time again and keeps the error, so a later run can try again.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  assessment_id uuid not null unique references public.assessments (id) on delete cascade,
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  model jsonb not null check (pg_column_size(model) < 20000),
  -- Questions answered, and minutes on them (from the answer times).
  questions smallint not null check (questions between 1 and 200),
  minutes smallint not null check (minutes between 0 and 6000),
  emailed_at timestamptz,
  email_id text check (char_length(email_id) <= 100),
  email_error text check (char_length(email_error) <= 500),
  alerted_at timestamptz,
  alert_error text check (char_length(alert_error) <= 500)
);
create index reports_parent_id_idx on public.reports (parent_id);
create index reports_child_id_idx on public.reports (child_id, created_at);

alter table public.reports enable row level security;
revoke all on table public.reports from anon, authenticated;
grant select (id, created_at, assessment_id, child_id, model, questions, minutes) on table public.reports to authenticated;
create policy "Parents read their own reports" on public.reports
  for select to authenticated using ((select auth.uid()) = parent_id);
