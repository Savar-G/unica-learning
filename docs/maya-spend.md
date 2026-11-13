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

The week is the family's week: Monday 00:00 to Monday 00:00 in the family's time zone (`src/lib/family-time.ts`). The month is the calendar month in Pacific time.

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

## The budget block of a voice call

Latency plan V1 (Chief of Staff, 2026-11-13): a voice turn does not wait for database work while its model block and speech-to-text coverage remain valid. Before, each turn made two requests (a cap read and the reservation, about 0.5 s from the voice worker). Code: `src/lib/maya-spend-block.ts`, wired in `src/lib/maya-spend.ts` (`SpendLedger.block`, `CallSpend.budget`) and `openVoice` in `src/lib/maya-call.ts`. Chat is unchanged: each message reads the cap, then reserves its model request.

- **The block.** When a voice call opens, one `reserve_maya_spend` request (no force, the child's lock) reserves a block of 4 model attempts (4 x USD 0.15) for the call, as one ordinary `maya_spend` row with what `model`. When the week does not cover 4, it reserves 1. When it does not cover 1, nothing: the call closes at the cap, as before. No new database function was needed.
- **The gate.** Before the session takes a turn's input, the call module asks the block for one model attempt for that turn. The check is in memory and synchronous: there is no wait between the check and the session taking the input. A turn with the child's words needs 1 free attempt. A turn with no child words (a silence check-in, a writing status) needs 2, so the last attempt stays for the child's words. Turns that overlap each hold their own attempt.
- **Paying.** Each paid model attempt of the call (the first one, a repair, a retry, a streamed one) and each free-talk review takes its reservation from the block in memory, and its real cost replaces the reservation when it comes back: the reported cost, the reservation when the cost is not known, nothing when it was never sent. The turn's first attempt takes the attempt the gate held; a turn that asked no model gives it back.
- **Refill.** When fewer than 2 attempts are free, or the newest block is 7 minutes old, one new block is reserved in the background. One refill runs at a time, and no turn waits for it unless the allowance is 0. A refused refill is not tried again in the background: the call runs on what it has. At 0, the turn tries once more (after the blocks it retired are settled); when that is refused too, the turn closes with code's line, and the child's words get the safety read.
- **Retire and settle.** A block takes no more attempts at 8 minutes (below the 10-minute expiry of an unsettled reservation), when a newer block exists and it has no whole attempt left or open, and at the call's end. Its age starts before the reservation request. A late response cannot give fresh allowance to an old reservation. Retirement cancels admissions that no request claimed. A retired block is settled once, with the real total of its sent attempts, when its last attempt is back. Its unused room goes back to the week.
- **Stop and replacement.** Stop closes admission before any database wait. The metered client checks the claimed attempt again immediately before network dispatch. Each open voice handle has its own `budgetKey`, also given to its model and reviewer. A replacement retires the old generation. An old handle cannot stop or spend the replacement's budget.
- **Speech-to-text renewal.** `VoiceMeter.state()` reads admitted coverage without I/O. Renewal runs on the worker's timer or beside a turn. The turn can use valid coverage while renewal waits. Without coverage, teaching waits for a fresh reservation or closes on refusal. A known refusal closes the call.
- **Safety ordering.** A cap close stops model admission synchronously and runs the forced safety read without waiting for model-block settlement. Guidance, the flag and the alert do not wait for that settlement.
- **A crash.** The block stays counted at its reservation until the 10-minute expiry, then stops counting. The real cost of attempts made from it is then lost to the week: usually under CAD 0.30 a crash. A worker shutdown on deploy is not a crash: `end` settles.
- **What it changes.** What another call of the child spends, and a ledger that cannot be read, take effect at the call's next refill or at its end, not in the middle of a block (at most 4 attempts, about a minute of talk). The block spends only money the database admitted under the child's lock, so the calls of a child together never pass the week. In the meantime, a chat of the same child sees the block's unused room as used. The safety read never comes from the block: it is forced, off the child's week, and never refused.
- **Overlapping turns.** A refusal in the middle of a turn is counted per turn (one shared flag lost a refusal when a check-in and a child turn overlapped). A check-in never closes the call while another turn runs; it answers nothing. When a turn closes the call while other turns run, the safety read reads the child's words of every turn whose answer the close drops.

### The seam for the text session (agreed with the Maya lead, 2026-11-13)

The text session does not import the block. The call module gives it `budget.seam` (`BlockSeam` in `src/lib/maya-spend-block.ts`):

```ts
take(kind: "model" | "speculative"): Handle | null; // synchronous; null when there is no room
settle(handle: Handle, usd: number, how?: { used?: boolean }): void; // the attempt's real cost
giveBack(handle: Handle): void; // never sent: costs nothing
```

- The block enforces the rules, not the caller: at most 3 `speculative` takes a turn (the call module calls `budget.newTurn()` when it admits a turn); a `speculative` take is refused when 2 or fewer attempts are free, so speculation leaves at least 2 attempts for live work; and the week's cap, as above.
- A `model` take is the turn's admitted attempt first, then a fresh one.
- A speculative attempt whose reply is used stays kind `speculative`: `settle(handle, usd, { used: true })` marks it. Nothing is re-labelled `model`.
- `budget.totals()` gives the settled costs per kind in micros (`model`, `speculative`, `speculativeUsed`, `review`). The database keeps one row per block (what `model`); the detail per attempt is in `ai_usage_events`. A separate `what` for speculation in `maya_spend` would need a migration.
- A client whose attempts the session pays through the seam must not also be metered through the ledger, or the attempt is paid twice. In `openVoice` the line that passes the seam to the session is marked and commented out: this base's text session options have no `spend` field yet.

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

Admins read `public.maya_spend` (one row per attempt: charge, child, call, what, week, month, reserved and actual micros, whether the cost was unknown; for a voice call's model and review attempts, one row per budget block, with the block's reservation and its real total). Parents read nothing directly; Parent home reads through the server.

```sql
-- This month's total, in CAD.
select sum(coalesce(cost_micros, reserved_micros)) / 1e6 as cad from public.maya_spend where month = date_trunc('month', now() at time zone 'America/Vancouver')::date;
```
