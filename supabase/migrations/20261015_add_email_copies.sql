-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_email_copies, 2026-10-15.
-- A copy of each logged email as the site sent it (D-103), so the admin can read it the way the parent got it: one row
-- per reminder (email_log) and per report email or report alert (reports). The send ledger writes it right after each
-- send attempt; a retry writes over the copy of the attempt before. Unsubscribe tokens are taken out before the write.
-- The server writes with the secret key (service_role skips row-level security); admins read; parents get nothing.
-- A family deletion removes the copies with the parent (cascade), and the family write fence covers new rows.
-- Additive: no code on main reads or writes it.
create table public.email_copies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  email_log_id uuid unique references public.email_log (id) on delete cascade,
  report_id uuid references public.reports (id) on delete cascade,
  -- Which email of the report: 'parent' (the report email) or 'alert' (the report alert to Savar).
  report_email text check (report_email in ('parent', 'alert')),
  -- What the send attempt did, as the delivery module saw it.
  outcome text not null check (outcome in ('sent', 'refused', 'unknown')),
  from_address text check (char_length(from_address) <= 320),
  to_address text not null check (char_length(to_address) <= 320),
  reply_to text check (char_length(reply_to) <= 320),
  subject text not null check (char_length(subject) <= 500),
  text_body text not null check (char_length(text_body) <= 200000),
  html_body text check (char_length(html_body) <= 500000),
  -- The copy is of one email: a reminder, or one email of a report.
  check ((email_log_id is null) <> (report_id is null)),
  check ((report_id is null) = (report_email is null)),
  unique (report_id, report_email)
);
create index email_copies_parent_idx on public.email_copies (parent_id);

alter table public.email_copies enable row level security;
revoke all on table public.email_copies from anon, authenticated;
grant select on table public.email_copies to authenticated;
create policy "Admins read the email copies" on public.email_copies
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.email_copies
  for each row execute function public.fence_family_write();
