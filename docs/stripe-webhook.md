# Stripe webhook: plan state

The route `POST /api/stripe-webhook` keeps one row per child in `public.child_plan_states`, so a page load does not call Stripe per child (#548, spec #544). No page reads the row yet. It also brings a child's Stripe side to their newest card (#554, below).

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

## Limit to know before a page reads the row

A filled row changes only through an event. If the endpoint is not set up, or Stripe stops trying an event, the row stays as it was. Set up the endpoint before a parent-facing page reads the row.

## Checks

- Unit tests: `npx vitest run src/lib/plan-state.test.ts src/lib/plan-state-server.test.ts src/lib/card-reconcile.test.ts src/app/api/stripe-webhook/route.test.ts`.
- Database rules: post `supabase/tests/child_plan_states.sql` to the Supabase Management API (`/v1/projects/cdjobwsyzndtltzfpyqa/database/query`, Keychain token `supabase-pagewise`). A pass is the error `PROBE_OK`: the final exception rolls back every synthetic row.
- Local events: `stripe listen --forward-to localhost:3000/api/stripe-webhook`, then set the secret it prints as `STRIPE_WEBHOOK_SECRET` in `.env.local`.


## Pause and paid Restart (#559, #546)

A native pause has its own `paused` plan state. The state stores the scheduled resume date in `next_charge_at`. A scheduled pause at the next renewal shows the resume date as the next charge date. The Account tab also applies confirmed dates from the private pause record while the stored plan still has its old renewal date. A pending control shows an unknown plan.

Add the two pause events before release. Verify subscription schedule read, write, release and cancel permissions on the restricted key. See `docs/plan-controls.md` for the supported state matrix and provider checks. No change in this implementation enables the dashboard.
