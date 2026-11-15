-- The team's daily digest email (docs/team-digest.md). Additive: one table.
--
-- team_digest_days: one row per digest day (a Pacific calendar day). The reminders run claims the day by inserting its row; the
-- primary key lets one run win. state 'claimed' means a run took the day and is sending, or the email may have gone (a 5xx, a
-- timeout, no answer): nothing sends it again. 'sent' stores the provider's id. A refused send deletes the row, so a later run tries
-- again. weekly: the email held the Friday "This week" part. The email_log cannot hold this claim: its rows need a parent.
-- No policy and no grant for anon, authenticated or admins: only the server's secret key reads and writes it. Holds no family data.
create table public.team_digest_days (
  day date primary key,
  state text not null default 'claimed' check (state in ('claimed', 'sent')),
  weekly boolean not null default false,
  email_id text check (char_length(email_id) <= 100),
  error text check (char_length(error) <= 500),
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.team_digest_days enable row level security;
revoke all on table public.team_digest_days from anon, authenticated;
grant select, insert, update, delete on table public.team_digest_days to service_role;
