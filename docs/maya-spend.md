# Maya's spending cap

Decisions D-290 and D-291. Savar decided the amount: CAD 10 per child per week (2026-11-05). The rest is the agent's design. Code: `src/lib/maya-spend.ts` (the ledger), `src/lib/maya-spend-ai.ts` (the metered AI client), `src/lib/maya-spend-store.ts` (Supabase), `src/lib/maya-spend-memory.ts` (tests), `src/lib/maya-spend-server.ts` (server wiring). Migrations: `add_maya_spend`, `maya_spend_no_monthly_stop`.

## The amounts

| What | Amount | Setting |
|---|---|---|
| One child, one week | CAD 10 | `WEEK_CAD` in `src/lib/maya-spend.ts` |
| Team alert, all of Maya, one month | CAD 400. It stops nobody. | `MAYA_MONTHLY_ALERT_CAD` |
| US dollars to CAD | 1.40 | `MAYA_USD_TO_CAD` |
| Speech-to-text | USD 0.01 a minute | `MAYA_STT_USD_PER_MINUTE` |
| Maya's voice | USD 0.03 per 1,000 characters | `MAYA_VOICE_USD_PER_1K_CHARS` |

OpenRouter reports each attempt's cost in US dollars. The ledger turns it into CAD with the one configured rate, and keeps whole micro-units of CAD (1 CAD = 1,000,000). The rate is not looked up: change `MAYA_USD_TO_CAD` in Vercel and in the voice worker's settings when the dollar moves. The speech-to-text and voice rates are estimates, because the voice providers report no cost per call; set them from the providers' price pages.

The week is the minutes ledger's week: Monday 00:00 to Monday 00:00 in the family's time zone (`src/lib/family-time.ts`). The month is the calendar month in Pacific time.

## What counts

Each provider attempt is reserved before it is sent, retries included, and settled with its cost when it comes back:

- Maya's model (`AI_MODEL`), reserving USD 0.15 an attempt.
- The free-talk review (`MAYA_REVIEW_MODEL`), USD 0.02.
- The call note's AI pick, USD 0.05.
- The child profile's AI findings after a call, USD 0.30. The sweep of abandoned calls goes the same way.
- A voice call's speech-to-text, a minute at a time. The worker asks every 10 seconds, whatever the child is doing, and the next block is reserved 20 seconds before the current one ends. A block settles at the time used.
- A voice call's voice, counted when audio comes back from the provider (`ttsNode` in `worker/maya-voice/src/agent.ts`). This covers replies, acknowledgement phrases and guidance said again. Output that gives no audio counts nothing. The count never holds audio back.

An attempt whose cost is not known (no answer, a time-out, an answer with no cost) stays counted at its reservation. An attempt that gets an HTTP error with no cost, or that was never sent, counts nothing. A reservation left open for 10 minutes (a crash) stops counting, so it cannot lock a child out; a late settle still writes its cost.

A child's chats and calls count toward the child's week and the month's total. Admin test calls (`/admin/maya`), the local practice suite (`npm run maya:practice` on the API, counted after the run when `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set) and safety reads count only toward the month's total, never a child's week.

The reservation and the check are one database function under the child's lock (`reserve_maya_spend`), so requests sent together cannot spend past the cap. When the ledger cannot be read, Maya starts no new paid work and shows the short-break message: "Maya is taking a short break. There's no extra charge."

## At the cap

The ledger is "open" while one more model attempt (its reservation) fits. When it does not:

- In a call or chat, Maya finishes what she is saying, then says code's closing line ("That's all our time for this week. You worked hard today. See you next week!") and the call ends. Maya teaches no more. The parent's note reads it as a call that ran out of time.
- A voice call also closes this way when speech-to-text no longer fits, even in silence, and at once, also while a model request is running (its answer is not said). Speech-to-text then runs only until the call has ended after its closing line; that last stretch is counted past the cap.
- New chats and calls are refused. The child sees "You've used Maya's time for this week. She'll be back on Monday." (the real reset day in the family's time zone). Parent home says "Maya's weekly time is used up. It resets on Monday, November 9. There's no extra charge."
- From 80% of the week, Parent home says "Leah has used most of Maya's time for this week. It resets on Monday, November 9. There's no extra charge."
- A rebuild of the child's profile after the call makes no AI request. The new facts are stored, and the earlier findings stay.

## Safety

The cap never holds safety back. Code writes the guidance, and it needs no paid request. But only the model reads a child's words for danger: code has no detector. So when the cap or the call's own clock would leave a child's words unread (a message at the cap, a model attempt refused in the middle of a turn, a voice call closed while a request runs, or a message after the call's 10 minutes), they get one safety read. The read stands apart from the teaching session, so the session's clock does not stop it:

- It cannot be refused. It is sent even when the ledger cannot be read.
- It counts toward the month's total only, never the child's week. At most one read goes for each live call, because the call then ends.
- With no flag, none of the model's words are said, and code's closing line ends the call.
- With a danger, code's guidance is said, the flag is stored, the team's alert goes, and the call ends, as in any call. Past the call's clock the danger goes into the session as a safety signal, which the session takes before its clock.
- With a request for harmful content, its flag is stored and the team's alert goes, in chats and voice calls, at the cap and after the call's 10 minutes; only code's closing line is said, and nothing after the 10 minutes.
- Whatever the session holds, this path says only code's guidance and code's closing line.

A child with no live chat at the cap cannot type to Maya, because new chats are refused. That is a limit of this design: the desk then shows only the waiting message.

## The monthly alert

When the month's total reaches `MAYA_MONTHLY_ALERT_CAD`, at a reservation or when a cost settles higher than its reservation (checked against the month the reservation is in, also when the cost comes back after the month changed: `settle_maya_spend_month`, migration `maya_spend_settle_month`), the team gets one email at `SIGNUP_NOTIFY_EMAIL` (claimed in `public.maya_spend_alerts`). Nothing changes for families. The month is claimed before the email is sent: if that email fails, the server logs it and does not send it again that month.

## Reading it

Admins read `public.maya_spend` (one row per attempt: charge, child, call, what, week, month, reserved and actual micros, whether the cost was unknown). Parents read nothing directly; Parent home reads through the server.

```sql
-- This month's total, in CAD.
select sum(coalesce(cost_micros, reserved_micros)) / 1e6 as cad from public.maya_spend where month = date_trunc('month', now() at time zone 'America/Vancouver')::date;
```
