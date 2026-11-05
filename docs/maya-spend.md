# Maya's spending cap

Decisions D-290 and D-291 (Savar, 2026-11-05). Code: `src/lib/maya-spend.ts` (the ledger), `src/lib/maya-spend-ai.ts` (the metered AI client), `src/lib/maya-spend-store.ts` (Supabase), `src/lib/maya-spend-memory.ts` (tests), `src/lib/maya-spend-server.ts` (server wiring). Migration: `supabase/migrations/20261105_add_maya_spend.sql` (`add_maya_spend`).

## The amounts

| What | Amount | Setting |
|---|---|---|
| One child, one week | CAD 10 | `WEEK_CAD` in `src/lib/maya-spend.ts` |
| All of Maya, one month | CAD 400 | `MAYA_MONTHLY_CAP_CAD` |
| US dollars to CAD | 1.40 | `MAYA_USD_TO_CAD` |
| Speech-to-text | USD 0.01 a minute | `MAYA_STT_USD_PER_MINUTE` |
| Maya's voice | USD 0.03 per 1,000 characters | `MAYA_VOICE_USD_PER_1K_CHARS` |

OpenRouter reports each request's cost in US dollars. The ledger turns it into CAD with the one configured rate, and keeps whole micro-units of CAD (1 CAD = 1,000,000). The rate is not looked up: change `MAYA_USD_TO_CAD` in Vercel and in the voice worker's settings when the dollar moves. The speech-to-text and voice rates are estimates, because the voice providers report no cost per call; set them from the providers' price pages.

The week is the minutes ledger's week: Monday 00:00 to Monday 00:00 in the family's time zone (`src/lib/family-time.ts`). The month is the calendar month in Pacific time.

## What counts

Every paid request is reserved before it is sent, and settled with its cost when it comes back:

- Maya's model (`AI_MODEL`), reserving USD 0.15 a request.
- The free-talk review (`MAYA_REVIEW_MODEL`), USD 0.02.
- The call note's AI pick, USD 0.05.
- A voice call's speech-to-text, a minute ahead at a time, settled at the time used.
- A voice call's voice, counted for each line before it is said.

A request whose cost is not known (no answer, a time-out, an answer with no cost) stays counted at its reservation. A request that gets an HTTP error with no cost counts nothing.

A child's chats and calls count toward the child's week and the monthly total. Admin test calls (`/admin/maya`) and the local practice suite (`npm run maya:practice` on the API, counted after the run when `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set) count only toward the monthly total. The practice suite costs about USD 17 (CAD 24) a full run, so about 16 full runs a month would pause Maya.

The reservation and the check are one database function under one lock (`reserve_maya_spend`), so requests sent together cannot spend past the cap. When the ledger cannot be read, Maya starts no new paid work and shows the short-break message.

## At the cap

The ledger is "open" while one more model request (its reservation) fits. When it does not:

- In a call or chat, Maya finishes what she is saying, then says code's closing line ("That's all our time for this week. You worked hard today. See you next week!") and the call ends. The model is asked nothing more. The parent's note reads it as a call that ran out of time.
- New chats and calls are refused. The child sees "You've used Maya's time for this week. She'll be back on Monday." (the real reset day in the family's time zone). Parent home says "Maya's weekly time is used up. It resets on Monday, November 9. There's no extra charge."
- From 80% of the week, Parent home says "Leah has used most of Maya's time for this week. It resets on Monday, November 9. There's no extra charge."
- Safety guidance needs no paid request: code writes it, and it is said before the closing line.

When the monthly total is reached, every child sees "Maya is taking a short break. There's no extra charge.", Parent home says the same, and the team gets one email at `SIGNUP_NOTIFY_EMAIL` for that month (claimed in `public.maya_spend_alerts`). To go on, raise `MAYA_MONTHLY_CAP_CAD`.

## Reading it

Admins read `public.maya_spend` (one row per request: charge, child, call, what, week, month, reserved and actual micros, whether the cost was unknown). Parents read nothing directly; Parent home reads through the server.

```sql
-- This month's total, in CAD.
select sum(coalesce(cost_micros, reserved_micros)) / 1e6 as cad from public.maya_spend where month = date_trunc('month', now() at time zone 'America/Vancouver')::date;
```
