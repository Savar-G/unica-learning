# Stripe webhook: plan state and family referrals

The route `POST /api/stripe-webhook` keeps one row per child in `public.child_plan_states`, so a page load does not call Stripe per child (#548, spec #544). The plan gate (`src/lib/plan-access.ts`) reads the row. It also brings a child's Stripe side to their newest card (#554, below).

The live destination is active with 19 events. On 14 November 2026 UTC, Savar explicitly authorized the referral additions through Aside. The update kept the seven plan events and added the 12 missing referral events. A fresh page load confirmed the full set. See [the live configuration record](../.design/evidence/referrals/live-stripe-config.json).

The route answers 503 if its required secrets are absent. Editing an existing destination's event list does not require a new destination or a new signing secret.

## Initial setup

These live steps require Savar's authorization. The existing destination is already configured. Keep it when adding or removing an approved event.

1. Open the Stripe Dashboard, Developers, Webhooks tab in Workbench: <https://dashboard.stripe.com/webhooks>.
2. Select "Add destination".
3. Under events from, select "Your account".
4. Under payload style, select **Snapshot**. Do not select Thin: the route reads the customer from the event's object, and a thin event has no object.
5. Keep the default API version. The route reads only the event's id, type, time and customer.
6. Keep these seven plan events and all referral events in [the referral configuration](referral-implementation.md#webhook-configuration). Two events overlap. The current combined set has 19 events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
   - `invoice.paid`
   - `invoice.payment_failed`
7. Under destination type, select "Webhook endpoint".
8. Set the URL to `https://unicalearning.com/api/stripe-webhook`. Use this exact host: the `www` address and the old Vercel addresses redirect, and Stripe does not follow a redirect.
9. Create the destination. Open its page and copy the signing secret (`whsec_...`).
10. In Vercel (project `unica-learning-landing-page`, team `unica-learning`), add the variable `STRIPE_WEBHOOK_SECRET` with that value, for Production only. Mark it sensitive.
11. Redeploy production, because a new variable reaches only a new deployment.
12. Check: in the destination's page, select a recent event and resend it, or wait for the next one. The answer must be 204.

`STRIPE_SECRET_KEY` needs no change: the route reads subscriptions and Customers and writes their default card, and the plan page, the admin dashboard and the card update already need that access.

## What each answer means

| Answer | Meaning | Does Stripe send it again? |
|---|---|---|
| 204 | Stored, or nothing to do: a duplicate, an older event, another event type, or a customer with no card setup. A card comparison that Stripe failed also answers 204: the row is flagged, and the sweep comes back | No |
| 400 | The signature is wrong, too old (more than 5 minutes) or missing | Yes |
| 500 | The plan state could not be kept (Stripe or the database failed, or the family is being deleted), or the card row could not be read or flagged | Yes |
| 503 | `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SECRET_KEY` or `STRIPE_SECRET_KEY` is not set | Yes |

Stripe tries a failed event again for up to three days in live mode. A customer with no card setup, such as an old booking, is logged in Vercel as `[stripe-webhook] no card setup for customer`.

## How it works

- `src/lib/plan-state.ts` holds the rules, behind a store seam and a provider seam.
- An event only says that something changed. Each event reads the customer's subscriptions again and stores what `parentPlan` makes of them. So the stored kind follows the same rule as the plan page: the zero invoice of a free month does not read as paying.
- The row keeps the read with the highest value from one database sequence. Each read takes its value from `take_plan_read_order` before it reads Stripe. So a read that missed a change took before that change, and the take of the change's own event comes after it. The order comes from the database, because the clocks of two application servers can disagree. A newer event that took first does not replace an older event that took later. A duplicate of the row's event writes nothing.
- An event older than the row's event skips the Stripe read and writes nothing, so a late event costs no Stripe call. The last change's event is never older than the row's event, so this skip cannot lose a change.
- `unknown` is never stored. A child with no row reads as `unknown`, and a failed read leaves the row as it is.
- `fillChildPlan` fills a missing row from Stripe. It never replaces a row. An event replaces a filled row unless the fill took later.
- `customerSubscriptions` (`src/lib/stripe-subscriptions.ts`) reads all pages of the customer's subscriptions, at most 10 pages of 100. `customerPlan`, `cancelPlan` and `startPlan` all use it. If it cannot read the whole list, it throws: the webhook answers 500, the plan page shows `unknown`, the cancel route answers 502 and the plan start route answers 502, with nothing cancelled and nothing started.

## The card comparison (#554)

On `customer.subscription.created` and `customer.subscription.updated`, for a customer with a row in `public.child_card_updates`, the route compares the Customer's default and each running plan's default with the row's newest card, and writes what differs (`checkCustomerCard`, `src/lib/card-reconcile.ts`). It runs apart from the plan state, so a failure of one does not stop the other.

- A late write or a late plan creation raises an event, and that event corrects it.
- No loop: a corrective write raises one more event, and that event finds nothing to change. It costs one Stripe read of the Customer and the list.
- An open plan start with a subscription of its key is decided here too: the card is corrected, the record closes as started and the parent gets the one confirmation email. A record younger than 60 seconds stays, as its start may still be answering. With no subscription after 24 hours, the record stays open and the team gets one alert: see `docs/parent-dashboard.md`.
- A write to the Customer alone raises no event we listen to. The sweep in `/api/reminders` covers it, and any event that was missed: see `docs/parent-dashboard.md`.
- A default changed by hand in Stripe's dashboard goes back to the row's card.

## The daily re-read

A lost event must not leave a stopped plan open, and must not lock out a parent who paid. So the sweep in the `/api/reminders` run reads each row of kind `free_month`, `paying`, `ending`, `payment_failed` or `paused` again when it has not been read for 24 hours (`sweepPlanReads`, `src/lib/card-reconcile.ts`; `rereadPlan`, `src/lib/plan-state.ts`; migrations `plan_state_reread` and `plan_state_reread_closed`).

It also reads a child whose plan started while the plan state does not show it (#713, migrations `plan_start_reread` and `plan_start_read_tried`, function `due_plan_start_reads`, `PLAN_START_READ_KINDS`). An admin's start and a parent's Restart write the plan state at once, and answer `access: "pending"` when that write does not answer that it stored. That covers a write that failed and a write that stored and lost its answer, so `pending` does not prove that access is closed. With a failed write and the webhook lost too, the row would stay closed on a running plan. The function lists a child when all of these hold:

- The newest plan start of its card setup is `started`, and it finished in the last 40 days. The bound keeps former customers out, as ended rows never leave the table. 40 days extends beyond the 30-day free month. A later Stripe event is not guaranteed to arrive or to save its result.
- It has no row, or its row is `not_started` or `ended` and was not read since the start finished, or not for 24 hours. The first case is a failed write after the start. The second is a read that began before the start and saved after it.
- Its card has a Stripe customer, and its family is not being deleted.

Other `ended` and `not_started` rows are never read. The function is separate from `due_plan_reads` because the deployed code fails the whole re-read on a row kind it does not know.

The two lists run in parallel (`sweepPlanReads`). Ordinary reads wait for no start read and keep their full row limit:

- The ordinary lane reads up to 200 rows of `due_plan_reads`, as before, with the whole run's time.
- The start lane reads at most `START_READ_LIMIT` (3) children of `due_plan_start_reads` in a run. One failed Stripe page takes about 9 seconds (4-second limit, one retry). Three such reads can start at about 0, 9 and 18 seconds, inside the 25-second start limit, and end at about 27 seconds, before the 45-second abort. More pages, schedule reads and database delays can take longer; the shared signal stops the work at 45 seconds. The ordinary list has the same time in parallel.
- The start list's place between runs is `plan_starts.read_tried_at`, on the newest started record, written by `note_plan_start_read_tried` before each read (migration `plan_start_read_tried`). A child with no row has no `read_tried_at` of its own, so the place goes on the start record. A start never tried comes first, then the start tried longest ago, so failing starts take turns: with n of them failing, each is tried within ceil(n / 3) runs when all three reads can start each time. A new start record has no try yet, so it comes first.
- A failed start list is one failure, and the ordinary lane goes on. A failed attempt note skips that start's Stripe read, so no start read runs without a saved attempt time.

- Each read takes its value from `take_plan_read_order`, reads Stripe through `customerPlan`, and saves through `save_child_plan_state`. So the order rule above holds: an event that took later wins, whichever save lands first.
- `read_at` is the last read, from the database's clock. Every save writes it, and `due_plan_reads` compares it with the same clock. A row read by a webhook or a start is not due.
- The save keeps the row's own event time, or the Unix start time for a filled row or a child with no row, with a new event id `plan-read:<take>`. It never stores a time of its own: the webhook skips an event older than the row's event, and our clock and Stripe's can disagree.
- `read_tried_at` is the place in the ordinary list between runs, and `plan_starts.read_tried_at` in the start list. A row is noted before its work, so a row that fails or hangs goes behind the others in its list.
- A failed read changes nothing, and the row stays due. Stripe being down closes no family and opens no family.
- What a read may store is one rule, `planReadMayStore`. On a closed row (`payment_failed`, `paused`):
  - `paying`: yes, the row reopens. Stripe `active` is the paid state: `past_due` goes to `active` on payment, and a pause resumes with `resume_on_payment_success`.
  - `ending` with `free: false`: yes, the row reopens until the end date (Stripe `active`, cancelling at the period's end, paid).
  - `payment_failed`, `paused`, `ended`: yes. The row stays closed.
  - `free_month`, `ending` with `free: true`, `not_started`: no. The row stays exactly as it is, and the read counts as `unclear`. A trial is not paid, and an empty list on a row that had a plan is not a clear answer. `not_started` would also take the family out of `familyHasPlanHistory`, and so away from its card and its plan's controls.
- On a row a start backs (`not_started`, `ended`):
  - `free_month`, `paying`, `ending` (free or paid): yes, the row opens. The free month is what a new start makes, a Restart is paid at once, and an `ending` plan is the started plan that the parent set to end.
  - `payment_failed`, `paused`, `ended`: yes. The row stays closed.
  - `not_started`: no, `unclear`. An empty list contradicts the start record.
- For a child with no row, every answer is stored, as a fill would store it. A child with no row reads as `unknown`, which is closed. Its start record keeps its place in the list before the read.
- An `unclear` row stays due and goes behind the others in its list when its attempt time is saved. It can use time in that list during this run. Start reads do not consume the ordinary list's 200 places or wait time: both lists run in parallel, under the same 25-second start and 45-second end limits. The log holds counts only. The take goes unused, and a gap changes nothing.
- A row of an open kind stores what Stripe says, as before.
- It runs beside the card rows, under the same times and the one signal: no new row after 25 seconds and no work after 45. One failed Stripe page takes about 9 seconds; the whole read can take longer. Each run lists at most 200 ordinary rows and 3 start rows.
- It writes the plan state and nothing else: no Stripe write and no email code. **That write can still make a scan reminder due through the database, as the lost webhook's own write would have.** `_workbook_scan_reminder_program` reads the row when a reminder comes due. A `free_month` row with a passed `next_charge_at` makes the program false, and the re-read's `paying` makes it true. The reopen of a `payment_failed` row does the same, to `paying` or to a paid `ending`, and so does a `paused` row once no applied pause is left to retire. The send stays behind `WORKBOOK_SCAN_TEST_PARENT_IDS` and `WORKBOOK_SCAN_REMINDERS_ENABLED`. `src/lib/plan-access-emails.test.ts` follows TypeScript imports only, so it cannot see this database path. `supabase/tests/child_plan_states.sql` checks it.
- `?dry=1` counts due rows as `planReads`, the start rows too, of which a run reads 3. The run's answer holds `cards.planReads`: `due`, `read`, `changed`, `unclear`, `failed`, `outOfTime`. `changed` above 0 means that a row's kind moved with no event yet, so look for a lost webhook. `unclear` above 0 means that a closed row's plan looks like a trial or has no subscriptions, so a person should look at that customer in Stripe.

### What the re-read does not cover

- A start or a restart with a failed plan state write and a lost webhook is covered since #713 (above): the start lane reads the child while Stripe answers, and opens the row on a running plan. Before that fix, the webhook was the only fallback for a `not_started` or `ended` row. It is not a promise of a time: see below.
- A start that the card sweep closes as `other` (another running plan was found) is not a `started` start, so this read does not take it. A later webhook for that other plan can update its row if delivery and the write succeed.
- A start that finished more than 40 days ago with a row that still does not show it is not read. A later Stripe event can update the row if delivery and the write succeed.

### The longest time a row can be wrong

With Stripe answering and the run working: 24 hours from the row's last read, plus the wait for the next run (up to 15 minutes), plus that run's time. So about 24 hours and 15 minutes, both for a stopped plan that stays open and for a parent who paid and stays locked out. An `ending` row closes on its end date with no read. A start whose plan state write failed, with Stripe answering, is read in the next run when it is one of the 3 tried longest ago; more failing starts take turns, as above.

That time gets longer in these cases:

- Each failed read adds up to 15 minutes, as the next try is in the next run. **While Stripe does not answer, there is no limit**, by rule: the row stays as it is, open or closed.
- `/api/reminders` does not run, or answers 503: no limit until it runs again.
- More rows are due than a run can read. With single-page reads that each take about 9 seconds, each list can start about 3 reads before 25 seconds, or about 288 per day at 96 runs per day. Pagination, schedule reads, database delays or a later sweep start can reduce this number. The start list remains limited to 3 even when reads fail at once. Normal Stripe answers are much faster. Watch `outOfTime` in `cards.planReads`.
- Stripe answers `resource_missing` for a customer it cannot find (a test-mode customer on the live key, or a wrong key): each read fails, so the row stays as it is. This is on purpose: a wrong key would otherwise close every family. A customer deleted in Stripe is different: its list still answers, with the cancelled subscription, so the row stores `ended`.
- A closed row's answer is `unclear`: the row stays closed until a clear answer or an event.

Proof on 7 November 2026, in Stripe test mode with a test clock, through `sweepPlanReads` with the real Stripe client and the memory store: a subscription went `past_due`, the re-read kept `payment_failed` and the gate closed, the invoice was paid, and the next re-read stored `paying` with no event, and the gate opened.

## Checks

- Unit tests: `npx vitest run --maxWorkers=2 src/lib/plan-state.test.ts src/lib/plan-state-server.test.ts src/lib/plan-read-sweep.test.ts src/lib/card-sweep-server.test.ts src/lib/card-reconcile.test.ts src/app/api/stripe-webhook/route.test.ts src/lib/plan-controls-server.test.ts "src/app/api/admin/cards/[id]/start/route.test.ts"`.
- Database rules: run `supabase/tests/child_plan_states.sql` and `supabase/tests/plan_start_reads.sql` through the Supabase MCP for project `cdjobwsyzndtltzfpyqa`. A pass is the error `PROBE_OK` from each: the final exception rolls back every synthetic row.
- Local events: `stripe listen --forward-to localhost:3000/api/stripe-webhook`, then set the secret it prints as `STRIPE_WEBHOOK_SECRET` in `.env.local`.


## Pause and paid Restart (#559, #546)

A native pause has its own `paused` plan state. The state stores the scheduled resume date in `next_charge_at`. A scheduled pause at the next renewal shows the resume date as the next charge date. The Account tab also applies confirmed dates from the private pause record while the stored plan still has its old renewal date. A pending control shows an unknown plan.

Add the two pause events before release. Verify subscription schedule read, write, release and cancel permissions on the restricted key. See `docs/plan-controls.md` for the supported state matrix and provider checks. No change in this implementation enables the dashboard.
