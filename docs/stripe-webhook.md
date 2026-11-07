# Stripe webhook: plan state

The route `POST /api/stripe-webhook` keeps one row per child in `public.child_plan_states`, so a page load does not call Stripe per child (#548, spec #544). The plan gate (`src/lib/plan-access.ts`) reads the row. It also brings a child's Stripe side to their newest card (#554, below).

Until the steps below are done, the route answers 503 and no event is stored.

## Steps for Savar

Do these in live mode. Agents do not do them.

1. Open the Stripe Dashboard, Developers, Webhooks tab in Workbench: <https://dashboard.stripe.com/webhooks>.
2. Select "Add destination".
3. Under events from, select "Your account".
4. Under payload style, select **Snapshot**. Do not select Thin: the route reads the customer from the event's object, and a thin event has no object.
5. Keep the default API version. The route reads only the event's id, type, time and customer.
6. Select exactly these 7 events:
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

A lost event must not leave a stopped plan open, and must not lock out a parent who paid. So the sweep in the `/api/reminders` run reads each row of kind `free_month`, `paying`, `ending`, `payment_failed` or `paused` again when it has not been read for 24 hours (`sweepPlanReads`, `src/lib/card-reconcile.ts`; `rereadPlan`, `src/lib/plan-state.ts`; migrations `plan_state_reread` and `plan_state_reread_closed`). Rows of kind `ended` and `not_started` are not read: a start or a restart writes those rows.

- Each read takes its value from `take_plan_read_order`, reads Stripe through `customerPlan`, and saves through `save_child_plan_state`. So the order rule above holds: an event that took later wins, whichever save lands first.
- `read_at` is the last read, from the database's clock. Every save writes it, and `due_plan_reads` compares it with the same clock. A row read by a webhook or a start is not due.
- The save keeps the row's own event time, or the Unix start time for a filled row, with a new event id `plan-read:<take>`. It never stores a time of its own: the webhook skips an event older than the row's event, and our clock and Stripe's can disagree.
- `read_tried_at` is the place in the list between runs. A row is noted before its work, so a row that fails or hangs goes behind the others.
- A failed read changes nothing, and the row stays due. Stripe being down closes no family and opens no family.
- What a read may store on a closed row (`payment_failed`, `paused`) is one rule, `planReadMayStore`:
  - `paying`: yes, the row reopens. Stripe `active` is the paid state: `past_due` goes to `active` on payment, and a pause resumes with `resume_on_payment_success`.
  - `ending` with `free: false`: yes (Stripe `active`, cancelling at the period's end, paid).
  - `payment_failed`, `paused`, `ended`: yes. The row stays closed.
  - `free_month`, `ending` with `free: true`, `not_started`: no. The row stays exactly as it is, and the read counts as `unclear`. A trial is not paid, and an empty list on a row that had a plan is not a clear answer. `not_started` would also take the family out of `familyHasPlanHistory`, and so away from its card and its plan's controls.
- An `unclear` row stays due and goes behind the others, so it is read about once in each run while nothing changes, and cannot hold up other rows. The log holds counts only. The take goes unused, and a gap changes nothing.
- A row of an open kind stores what Stripe says, as before.
- It runs beside the card rows, under the same times and the one signal: no new row after 25 seconds and no work after 45. One read has Stripe's limit of about 9 seconds. Each run lists at most 200 rows.
- It writes the plan state and nothing else: no Stripe write and no email.
- `?dry=1` counts due rows as `planReads`. The run's answer holds `cards.planReads`: `due`, `read`, `changed`, `unclear`, `failed`, `outOfTime`. `changed` above 0 means that a row's kind moved with no event yet, so look for a lost webhook. `unclear` above 0 means that a closed row's plan looks like a trial or has no subscriptions, so a person should look at that customer in Stripe.

### The longest time a row can be wrong

With Stripe answering and the run working: 24 hours from the row's last read, plus the wait for the next run (up to 15 minutes), plus that run's time. So about 24 hours and 15 minutes, both for a stopped plan that stays open and for a parent who paid and stays locked out. An `ending` row closes on its end date with no read.

That time gets longer in these cases:

- Each failed read adds up to 15 minutes, as the next try is in the next run. **While Stripe does not answer, there is no limit**, by rule: the row stays as it is, open or closed.
- `/api/reminders` does not run, or answers 503: no limit until it runs again.
- More rows are due than a run can read. At the slowest answers each client allows, a run reads about 5 rows, which is about 480 rows a day. Normal Stripe answers are much faster. Watch `outOfTime` in `cards.planReads`.
- Stripe answers `resource_missing` for a customer it cannot find (a test-mode customer on the live key, or a wrong key): each read fails, so the row stays as it is. This is on purpose: a wrong key would otherwise close every family. A customer deleted in Stripe is different: its list still answers, with the cancelled subscription, so the row stores `ended`.
- A closed row's answer is `unclear`: the row stays closed until a clear answer or an event.

Proof on 7 November 2026, in Stripe test mode with a test clock, through `sweepPlanReads` with the real Stripe client and the memory store: a subscription went `past_due`, the re-read kept `payment_failed` and the gate closed, the invoice was paid, and the next re-read stored `paying` with no event, and the gate opened.

## Checks

- Unit tests: `npx vitest run src/lib/plan-state.test.ts src/lib/plan-state-server.test.ts src/lib/plan-read-sweep.test.ts src/lib/card-sweep-server.test.ts src/lib/card-reconcile.test.ts src/app/api/stripe-webhook/route.test.ts`.
- Database rules: post `supabase/tests/child_plan_states.sql` to the Supabase Management API (`/v1/projects/cdjobwsyzndtltzfpyqa/database/query`, Keychain token `supabase-pagewise`). A pass is the error `PROBE_OK`: the final exception rolls back every synthetic row.
- Local events: `stripe listen --forward-to localhost:3000/api/stripe-webhook`, then set the secret it prints as `STRIPE_WEBHOOK_SECRET` in `.env.local`.


## Pause and paid Restart (#559, #546)

A native pause has its own `paused` plan state. The state stores the scheduled resume date in `next_charge_at`. A scheduled pause at the next renewal shows the resume date as the next charge date. The Account tab also applies confirmed dates from the private pause record while the stored plan still has its old renewal date. A pending control shows an unknown plan.

Add the two pause events before release. Verify subscription schedule read, write, release and cancel permissions on the restricted key. See `docs/plan-controls.md` for the supported state matrix and provider checks. No change in this implementation enables the dashboard.
