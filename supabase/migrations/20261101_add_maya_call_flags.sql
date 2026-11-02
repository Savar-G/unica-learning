-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_maya_call_flags, 2026-11-01 (Management API).
-- Maya's safety flag and internal alert (#333, spec #297). When the controller's SAFETY interrupt fires in a saved call
-- (src/lib/maya-call.ts), the call is flagged, and an internal alert email goes to the team (SIGNUP_NOTIFY_EMAIL) through
-- the email delivery module with a send key, so it is sent once (src/lib/maya-call-alert.ts). A request for harmful
-- content (#383 C29, reading.unsafeRequest) raises the flag its setting names (UNSAFE_REQUEST_FLAG).
--
-- maya_calls.flag: the call's highest flag so far, and flagged_at, when the call first reached it. Levels, lowest
--   first: 'unsafe_request' (the child asked for content Maya does not give), 'safety_concern' and 'safety_immediate'
--   (the SAFETY interrupt, by its severity). A flag only rises. It follows the call's access and deletion rules: the
--   server writes, admins read, parents read nothing (no parent read of Maya calls exists yet).
-- maya_call_alerts: one row per alert, one alert per call and flag level (the send key). The row is the send claim:
--   status 'sending' while a run sends, then 'sent' (with Resend's email id), 'refused' (the email did not go; a later
--   request on the call claims it again) or 'unknown' (it may have gone; nothing sends it again). A 'sending' claim
--   older than 10 minutes, left by a run that stopped, may be claimed again: for an internal safety alert a second copy
--   is better than none. subject and text_body keep the email as sent (D-103), with no child words in it. The admin call
--   page shows each alert's status and error.
--
-- Only the server writes, with the secret key (service_role skips row-level security). Admins read. Parents and anon
-- read nothing. A family deletion removes the alerts through the foreign keys (on delete cascade from the call and
-- from the parent); there are no files. The family write fence covers new rows and changes.
-- Additive: two nullable columns, a unique index and one new table that the code on main does not read or write.
alter table public.maya_calls
  add column flag text check (flag in ('unsafe_request', 'safety_concern', 'safety_immediate')),
  add column flagged_at timestamptz,
  add constraint maya_calls_flag_time check ((flag is null) = (flagged_at is null));
create index maya_calls_flag_idx on public.maya_calls (flagged_at desc) where flag is not null;
-- For the alerts' foreign key: an alert names its call and the call's family together.
create unique index maya_calls_id_parent_key on public.maya_calls (id, parent_id);

create table public.maya_call_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  call_id uuid not null,
  parent_id uuid not null references public.parents (id) on delete cascade,
  level text not null check (level in ('unsafe_request', 'safety_concern', 'safety_immediate')),
  status text not null check (status in ('sending', 'sent', 'refused', 'unknown')),
  claimed_at timestamptz not null,
  email_id text check (char_length(email_id) between 1 and 100),
  error text check (char_length(error) <= 500),
  subject text check (char_length(subject) <= 500),
  text_body text check (char_length(text_body) <= 5000),
  constraint maya_call_alerts_call_fkey foreign key (call_id, parent_id) references public.maya_calls (id, parent_id) on delete cascade,
  constraint maya_call_alerts_once unique (call_id, level),
  check (status <> 'sent' or email_id is not null)
);
create index maya_call_alerts_parent_idx on public.maya_call_alerts (parent_id);

alter table public.maya_call_alerts enable row level security;
revoke all on table public.maya_call_alerts from anon, authenticated, service_role;
grant select, insert, update on table public.maya_call_alerts to service_role;
grant select on table public.maya_call_alerts to authenticated;
create policy "Admins read Maya call alerts" on public.maya_call_alerts
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.maya_call_alerts
  for each row execute function public.fence_family_write();
