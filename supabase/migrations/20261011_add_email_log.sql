-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_email_log, 2026-10-11.
-- The email log (#73, D-085): one row per reminder email, and one per unsubscribe. The reminder job
-- (src/lib/reminder-store.ts, run by /api/reminders) and the unsubscribe page write it with the secret key
-- (service_role skips row-level security). anon and authenticated get nothing. Additive: no code on main reads it.
-- kind: continue = "continue your test" (1 hour after the last answer), come_back = after the 24-hour window ended,
--   start = 24 hours after a child was added with no test started, unsubscribe = the parent stopped all reminders.
-- status: the job claims a reminder (inserts its row as 'claimed') before it sends it, so two runs never send the same
--   email. 'sent' with Resend's email_id; 'failed' when Resend refused it (a later run tries again, up to 3 attempts).
--   A row left 'claimed' belongs to a send with no known outcome and is never sent again. Null for an unsubscribe.
-- unsubscribe_hash: SHA-256 of the random token in the reminder's unsubscribe link. Only the hash is kept.
create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid references public.children (id) on delete cascade,
  assessment_id uuid references public.assessments (id) on delete cascade,
  kind text not null check (kind in ('continue', 'come_back', 'start', 'unsubscribe')),
  status text check (status in ('claimed', 'sent', 'failed')),
  attempts smallint not null default 0 check (attempts between 0 and 10),
  sent_at timestamptz,
  email_id text check (char_length(email_id) <= 100),
  error text check (char_length(error) <= 500),
  unsubscribe_hash text unique check (unsubscribe_hash ~ '^[0-9a-f]{64}$'),
  -- A reminder is about a child; continue and come_back also about one test. An unsubscribe is about the parent only.
  check ((kind = 'unsubscribe') = (child_id is null)),
  check ((kind in ('continue', 'come_back')) = (assessment_id is not null)),
  check ((kind = 'unsubscribe') = (status is null)),
  check ((kind = 'unsubscribe') = (unsubscribe_hash is null)),
  check ((status = 'sent') = (sent_at is not null))
);
-- One row per reminder: one continue and one come_back per test (so at most 2 per test), one start per child, and one
-- unsubscribe per parent. A second claim of the same reminder fails here.
create unique index email_log_one_per_test on public.email_log (assessment_id, kind) where assessment_id is not null;
create unique index email_log_one_start_per_child on public.email_log (child_id) where kind = 'start';
create unique index email_log_one_unsubscribe_per_parent on public.email_log (parent_id) where kind = 'unsubscribe';
create index email_log_parent_idx on public.email_log (parent_id, created_at);
create index email_log_child_idx on public.email_log (child_id);

alter table public.email_log enable row level security;
revoke all on table public.email_log from anon, authenticated;
