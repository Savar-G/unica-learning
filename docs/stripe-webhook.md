# Stripe webhook: plan state

The route `POST /api/stripe-webhook` keeps one row per child in `public.child_plan_states`, so a page load does not call Stripe per child (#548, spec #544). No page reads the row yet.

Until the steps below are done, the route answers 503 and no event is stored.

## Steps for Savar

Do these in live mode. Agents do not do them.

1. Open the Stripe Dashboard, Developers, Webhooks tab in Workbench: <https://dashboard.stripe.com/webhooks>.
2. Select "Add destination".
3. Under events from, select "Your account".
4. Under payload style, select **Snapshot**. Do not select Thin: the route reads the customer from the event's object, and a thin event has no object.
5. Keep the default API version. The route reads only the event's id, type, time and customer.
6. Select exactly these 5 events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
7. Under destination type, select "Webhook endpoint".
8. Set the URL to `https://unicalearning.com/api/stripe-webhook`. Use this exact host: the `www` address and the old Vercel addresses redirect, and Stripe does not follow a redirect.
9. Create the destination. Open its page and copy the signing secret (`whsec_...`).
10. In Vercel (project `unica-learning-landing-page`, team `unica-learning`), add the variable `STRIPE_WEBHOOK_SECRET` with that value, for Production only. Mark it sensitive.
11. Redeploy production, because a new variable reaches only a new deployment.
12. Check: in the destination's page, select a recent event and resend it, or wait for the next one. The answer must be 204.

`STRIPE_SECRET_KEY` needs no change: the route reads subscriptions, and the plan page and admin dashboard already need that access.

## What each answer means

| Answer | Meaning | Does Stripe send it again? |
|---|---|---|
| 204 | Stored, or nothing to do: a duplicate, an older event, another event type, or a customer with no card setup | No |
| 400 | The signature is wrong, too old (more than 5 minutes) or missing | Yes |
| 500 | Stripe or the database failed, or the family is being deleted | Yes |
| 503 | `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SECRET_KEY` or `STRIPE_SECRET_KEY` is not set | Yes |

Stripe tries a failed event again for up to three days in live mode. A customer with no card setup, such as an old booking, is logged in Vercel as `[stripe-webhook] no card setup for customer`.

## How it works

- `src/lib/plan-state.ts` holds the rules, behind a store seam and a provider seam.
- An event only says that something changed. Each event reads the customer's subscriptions again and stores what `parentPlan` makes of them. So the stored kind follows the same rule as the plan page: the zero invoice of a free month does not read as paying.
- The row keeps the latest Stripe read, because each event reads Stripe again. A newer event whose read started first does not replace an older event whose read started later. Of two reads that start at the same time, the newer event stays. A duplicate of the row's event writes nothing.
- An event older than the row's event skips the Stripe read and writes nothing, so a late event costs no Stripe call. The last change's event is never older than the row's event, so this skip cannot lose a change.
- `unknown` is never stored. A child with no row reads as `unknown`, and a failed read leaves the row as it is.
- `fillChildPlan` fills a missing row from Stripe. It never replaces a row. An event replaces a filled row unless the fill's read started later.
- `customerPlan` reads all pages of the customer's subscriptions, at most 10 pages of 100. If it cannot read the whole list, it throws: the webhook answers 500 and the plan page shows `unknown`.

## Limit to know before a page reads the row

A filled row changes only through an event. If the endpoint is not set up, or Stripe stops trying an event, the row stays as it was. Set up the endpoint before a parent-facing page reads the row.

## Checks

- Unit tests: `npx vitest run src/lib/plan-state.test.ts src/lib/plan-state-server.test.ts src/app/api/stripe-webhook/route.test.ts`.
- Database rules: post `supabase/tests/child_plan_states.sql` to the Supabase Management API (`/v1/projects/cdjobwsyzndtltzfpyqa/database/query`, Keychain token `supabase-pagewise`). A pass is the error `PROBE_OK`: the final exception rolls back every synthetic row.
- Local events: `stripe listen --forward-to localhost:3000/api/stripe-webhook`, then set the secret it prints as `STRIPE_WEBHOOK_SECRET` in `.env.local`.
