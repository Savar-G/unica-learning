-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_email_events, 2026-10-15.
-- What happened to each email after Resend took it (D-104): Resend's webhook (/api/resend-webhook) posts delivery
-- events, and the admin email view shows them beside the kept copy (public.email_copies, D-103).
-- email_copies.email_id: Resend's id of the email, kept with the copy when the send went, so an event finds its email.
-- email_events: one row per webhook message (webhook_id is Svix's message id, so a message sent twice is kept once).
--   Only Resend's email id, the event type, its time and a short reason are kept; the reason has its email addresses
--   taken out, so the row names nobody. Events of emails without a copy (sign-in links, alerts) are kept the same way.
-- The server writes with the secret key; admins read; parents get nothing. Additive: no code on main reads either.
alter table public.email_copies add column email_id text check (char_length(email_id) <= 100);
create index email_copies_email_id_idx on public.email_copies (email_id) where email_id is not null;

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  webhook_id text not null unique check (char_length(webhook_id) <= 100),
  email_id text not null check (char_length(email_id) <= 100),
  type text not null check (type in ('delivered', 'delivery_delayed', 'bounced', 'complained', 'failed', 'suppressed')),
  occurred_at timestamptz not null,
  detail text check (char_length(detail) <= 500)
);
create index email_events_email_idx on public.email_events (email_id, occurred_at);

alter table public.email_events enable row level security;
revoke all on table public.email_events from anon, authenticated;
grant select on table public.email_events to authenticated;
create policy "Admins read the email events" on public.email_events
  for select to authenticated using ((select public.is_admin()));
