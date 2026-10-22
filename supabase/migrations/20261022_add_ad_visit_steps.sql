-- Ad test steps (D-126, docs/ad-tracking.md): how far a visit from an ad gets before signup, for every ad visitor, not
-- only the ones who accept optional cookies. The browser tab that has an ad visit ID (public.ad_visits) posts each step
-- once to /api/visit/step (src/app/api/visit/step/route.ts), which writes one row here after the response:
--   start_open   the signup page /start opened
--   form_start   the parent typed in the signup form
--   google_start the parent chose "Continue with Google" on /start
--   code_sent    the email code was sent (the form was complete)
-- A finished signup needs no step: parents.source->>'visit_id' joins the family to the visit.
-- ad_visit_steps: one row per visit and step, with the time. No IP, no user agent, no cookie, no form value: the same
--   data class as ad_visits, so the count needs no consent. A step for a visit ID that ad_visits does not hold is not
--   stored (the foreign key), and a deleted visit takes its steps with it.
-- The server writes steps with the secret key; admins read them; parents and visitors get nothing.
-- Additive: no code on main reads this table, and /api/visit/step fails quietly until it exists.
create table public.ad_visit_steps (
  visit_id uuid not null references public.ad_visits (visit_id) on delete cascade,
  step text not null check (step in ('start_open', 'form_start', 'google_start', 'code_sent')),
  stepped_at timestamptz not null default now(),
  primary key (visit_id, step)
);
create index ad_visit_steps_time_idx on public.ad_visit_steps (stepped_at);

alter table public.ad_visit_steps enable row level security;
revoke all on table public.ad_visit_steps from anon, authenticated;
grant select on table public.ad_visit_steps to authenticated;
create policy "Admins read the ad visit steps" on public.ad_visit_steps
  for select to authenticated using ((select public.is_admin()));
