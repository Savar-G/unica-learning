-- Door-to-door flyer test (A/B): two printed flyers, each with its own QR code to unicalearning.com/f/<code>.
-- /f/<code> (src/app/f/[code]/route.ts) counts the scan, then sends the visitor to /start with utm_source=flyer and
-- utm_content=<code>, so a signup keeps the flyer in parents.source (already stored by the signup form).
-- flyer_scans: one row per scan, with the code and the time. No IP, no device, no cookie: the count is raw, so one
--   person scanning twice counts twice. Signups (one family each) are the number to judge a flyer by.
-- flyer_batches: how many of each flyer were handed out, typed by an admin on /admin/flyers, so scans and signups can
--   be shown per 100 flyers.
-- The server writes scans with the secret key; admins read them and set the delivered counts; parents get nothing.
-- Additive: no code on main reads either table.
create table public.flyer_scans (
  id bigint generated always as identity primary key,
  scanned_at timestamptz not null default now(),
  code text not null check (code ~ '^[a-z0-9-]{1,20}$')
);
create index flyer_scans_code_time_idx on public.flyer_scans (code, scanned_at);

create table public.flyer_batches (
  code text primary key check (code ~ '^[a-z0-9-]{1,20}$'),
  delivered integer not null default 0 check (delivered >= 0 and delivered <= 100000),
  updated_at timestamptz not null default now()
);
insert into public.flyer_batches (code) values ('a'), ('b');

alter table public.flyer_scans enable row level security;
alter table public.flyer_batches enable row level security;
revoke all on table public.flyer_scans, public.flyer_batches from anon, authenticated;
grant select on table public.flyer_scans, public.flyer_batches to authenticated;
create policy "Admins read the flyer scans" on public.flyer_scans
  for select to authenticated using ((select public.is_admin()));
create policy "Admins read the flyer batches" on public.flyer_batches
  for select to authenticated using ((select public.is_admin()));
