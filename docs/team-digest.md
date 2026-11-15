# Team digest email

One email a day to the team (`SIGNUP_NOTIFY_EMAIL`) with every signal of the last day, so no stuck family is missed. On Fridays the same email adds "This week".

## Switch

`TEAM_DIGEST_EMAIL_ENABLED`: only the exact value `on` sends. Unset or any other value reads nothing and sends nothing. It is off by default.

## When it goes

The `/api/reminders` run (pg_cron, every 15 minutes) calls `runTeamDigest` (`src/lib/team-digest-send.ts`). The run calls it last, after every parent email of the run has left the shared paced transport, so a slow digest send never sits in front of parent mail. A digest failure never fails the run. From 7 a.m. Pacific, the first run of the Pacific day sends the email. Each later run that day sees the claim and reads nothing more.

We use the reminders run and not a new Vercel cron for two reasons. The run fires every 15 minutes, so a failed or refused send is tried again 15 minutes later. A daily Vercel cron does not retry. The run also already holds `CRON_SECRET`, the paced Resend transport and the time limit.

The day is claimed in `public.team_digest_days` (migration `team_digest_days`; one row per Pacific day; service role only; no family data). The send goes through `src/lib/email-delivery.ts` with the day as its send key:

- sent: the row keeps Resend's email id.
- refused: the row is deleted, so the next run tries again.
- unknown (5xx, time-out, no answer): the row stays, so nothing sends that day's email again.

`public.email_log` cannot hold this claim, because each of its rows needs a parent.

## What it covers

The day is from 7 a.m. Pacific the day before up to 7 a.m. Pacific on the email's day. Fridays also cover the last 7 days and the 7 days before them. A section with nothing in it is left out. An email with no section says "Nothing new" and still goes, so a missing email means a broken run.

| Section | Source | Admin link |
|---|---|---|
| New families | `parents.created_at`, `assessments.completed_at` (first 10 of each listed) | `/admin/parents/<id>`, `/admin/assessments/<id>` |
| Maya safety alerts | `maya_call_alerts` (test families included and marked) | `/admin/maya/<call>` |
| Plans | `child_plan_states`: every `payment_failed` row now; `ending` and `paying` rows with a Stripe event in the day; `plan_starts` open for more than 24 hours, and free months started in the day | `/admin/children/<id>`, `/admin/next-steps` |
| Waiting for the team | `scan_team_waiting_count()` now; `workbook_runs` failed or stale in the day; `workbook_book1_baseline_pending` rows of the day, only for a draft's newest approved revision with no baseline (`workbook_audit`, `workbook_book1_baselines`; the rule of `admin_book1_baseline_items`, `openBook1Records` in `src/lib/admin-book1-baselines.ts`) | `/admin/scans`, `/admin/workbooks/runs/<id>`, `/admin/next-steps` |
| Parent feedback | `feedback`: counts of messages and families only | `/admin/feedback` |
| Email delivery problems | `email_events` bounced, complained, failed, suppressed; the family comes from the email's copy (`email_copies.parent_id`), and a test family's email is left out; an event with no copy counts | `/admin/emails` |
| Ad visits by campaign | `ad_visits` by `utm_campaign`, with `ad_visit_steps`. The campaign is public text, so only a value in our tag style (lowercase letters, digits, hyphens and underscores, at most 40) is printed; every other value counts under "(other tagged visits)" | `/admin/traffic` |
| AI cost | `ai_usage_events`, the sum of reported costs, the calls with no cost reported apart (never as USD 0), subscription calls apart (no per-call charge), and the top 5 features (test families included, as the provider bills them) | `/admin/ai` |

Test families (`public.test_accounts` and `public.admin_users`, as on the admin dashboard) are left out of every family signal except safety alerts.

"Paying" means a Stripe event put the row in `paying` that day. That is a first charge or a monthly renewal; the table does not tell them apart.

## This week (Fridays)

A table of 7-day totals against the 7 days before: signups, finished tests, new families that finished a test, feedback, email problems, safety alerts, failed workbook runs, ad visits, ad visits that got an email code, AI cost (reported costs only) and AI calls with no cost reported.

"Things to look at" comes from fixed rules in `lookAt` (`src/lib/team-digest.ts`). There is no AI. Each rule names a number and a page:

- Families signed up and none of them finished a test; or, with 4 or more signups, fewer than half of them finished a test. Both count only the week's new families.
- Signups fell to half or less of a week with 4 or more.
- 3 or more email problems, or twice the week before.
- AI cost of USD 5 or more and at least 1.5 times the week before.
- 2 or more workbook runs failed or stopped.
- Any Maya safety alert.
- A campaign with 20 or more visits and no email code sent.
- Any failed payment now, any plan start open for more than 24 hours, any unread feedback from the week, any answer waiting for a team mark.

## Privacy

The email leaves our system. It holds only counts, short ids and admin links: no child name, no parent name or email, no feedback or message text. The reader (`src/lib/team-digest-store.ts`) selects only ids, kinds and times. The one free text it reads, `utm_campaign`, is printed by name only when it is one of the team's own campaigns (`KNOWN_CAMPAIGNS` in `src/lib/team-digest.ts`; add a new campaign there when it starts). Any other value counts under "(other tagged visits)". A read that reaches its 10,000-row limit is named in the email, and its count is a floor.

## Code

- `src/lib/team-digest.ts`: the pure builder (period, sections, week rules, the email text and HTML).
- `src/lib/team-digest-send.ts`: the run, the switch, the time limits and the day claim.
- `src/lib/team-digest-store.ts`: the database reader and claim, with the secret key.
- `src/lib/team-digest-memory.ts`: the in-memory store for tests.
- `src/lib/team-digest.test.ts`: the tests.
