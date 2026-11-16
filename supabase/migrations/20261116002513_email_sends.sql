-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration email_sends, version 20261116002513, 2026-11-16.
-- The send log of every email that has no other durable row (the admin Emails page shows every email the site sends).
-- Reminders, the Maya and monthly emails, the scan reminder and the first pages email stay in public.email_log; the
-- report email and the report alert stay on public.reports; the workbook emails stay in public.workbook_emails. Every
-- other send through the email delivery module (src/lib/email-delivery.ts) writes one row here after each attempt,
-- with its kind (src/lib/email-send-kinds.ts), the family and child it is about when there is one, the outcome, Resend's
-- id (so Resend's delivery events in public.email_events find it) and a copy of the email with link tokens hidden.
-- The emails that carry a secret (sign-in links, the phone welcome with its link, delete codes) and the contact form
-- message keep no copy, no subject and no address: only the kind, the time, the family, the outcome and Resend's id.
-- Team emails about no family have no parent.
-- The server writes with the secret key (service_role skips row-level security); admins read; parents get nothing.
-- Deleted with the family and the child (cascade); the family write fence covers new rows. Additive: no live code reads
-- or writes it.
create table public.email_sends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in (
    'signup_welcome', 'phone_welcome', 'sign_in_link', 'family_delete_code', 'child_delete_code', 'waitlist_note',
    'scan_link', 'plan_start', 'referral_reward',
    'contact_message', 'waitlist_alert', 'card_link_alert', 'report_failure_alert', 'report_retry_alert',
    'plan_start_alert', 'plan_cancel_alert', 'plan_cancelled_alert', 'family_delete_alert', 'maya_safety_alert',
    'maya_spend_alert', 'scan_team_daily', 'team_digest'
  )),
  parent_id uuid references public.parents (id) on delete cascade,
  child_id uuid references public.children (id) on delete cascade,
  -- What the send attempt did, as the delivery module saw it.
  outcome text not null check (outcome in ('sent', 'refused', 'unknown')),
  email_id text check (char_length(email_id) <= 100),
  error text check (char_length(error) <= 500),
  from_address text check (char_length(from_address) <= 320),
  to_address text check (char_length(to_address) <= 320),
  reply_to text check (char_length(reply_to) <= 320),
  subject text check (char_length(subject) <= 500),
  text_body text check (char_length(text_body) <= 200000),
  html_body text check (char_length(html_body) <= 500000),
  check (outcome <> 'sent' or error is null),
  -- Secret kinds keep the kind, the time, the family, the outcome and Resend's id only.
  check (kind not in ('sign_in_link', 'phone_welcome', 'family_delete_code', 'child_delete_code', 'contact_message')
    or (text_body is null and html_body is null and subject is null and to_address is null and reply_to is null and child_id is null))
);
create index email_sends_created_idx on public.email_sends (created_at desc);
create index email_sends_parent_idx on public.email_sends (parent_id) where parent_id is not null;
create index email_sends_child_idx on public.email_sends (child_id) where child_id is not null;
create index email_sends_email_id_idx on public.email_sends (email_id) where email_id is not null;

alter table public.email_sends enable row level security;
revoke all on table public.email_sends from anon, authenticated;
grant select on table public.email_sends to authenticated;
create policy "Admins read the email sends" on public.email_sends
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.email_sends
  for each row execute function public.fence_family_write();
