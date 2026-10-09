-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_signup_heard, 2026-10-08.
-- "How did you hear about us?" is asked on /thank-you after the signup is saved, so each answer is its own row,
-- matched to the signup by ref. The site gives every signup a ref from now on (waitlist rows too).
-- A parent can change the answer; the newest row per ref wins.
create table public.signup_heard (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  ref uuid not null references public.signups (ref) on delete cascade,
  channel text not null check (channel in ('friend', 'search', 'ai', 'social', 'other')),
  detail text check (char_length(detail) <= 80)
);
create index signup_heard_ref_idx on public.signup_heard (ref, created_at desc);
alter table public.signup_heard enable row level security;
revoke all on table public.signup_heard from anon, authenticated;
grant insert on table public.signup_heard to anon;
create policy "Site can add answers" on public.signup_heard
  for insert to anon with check (created_at > now() - interval '1 minute');
