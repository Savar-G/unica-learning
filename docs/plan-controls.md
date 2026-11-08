# Pause and paid Restart

Pause and Restart requests pass `planManagementAccess` (`src/lib/parent-dashboard-access.ts`, called from `src/lib/plan-control-request.ts`). It admits every family the dashboard opens to (the `PARENT_DASHBOARD_ENABLED` switch, test families and admins, or a child with an open plan) and every family that has or had a plan. Cancel (`/api/account/plan/cancel`) has no access gate beyond a signed-in parent who owns the card setup. The plan controls migration (`20261105234500_plan_controls.sql`) is applied in production as version `20261106010709`.

## Supported states

| State | Action |
| --- | --- |
| First free month, after the first delivery | Extend the existing trial end. Disable prorations. |
| Paid, flexible billing, automatic collection, one licensed monthly CAD item, no schedule | Pause at the next renewal. Resume after the requested local calendar weeks. Set the resume anchor to `resume_at` and require payment success. |
| Classic paid subscription, existing schedule, mixed items, failed payment, ending plan | Refuse Pause safely. Do not migrate billing mode or grant a new trial. |
| Ended plan, saved card | Create an immediate paid monthly subscription in flexible mode. Use `error_if_incomplete`. Do not send trial fields. |
| Ended plan, no current usable card | Use the existing hosted Update card flow. The parent then returns to confirm paid Restart. |
| Unknown provider result | Keep the durable operation and deletion hold. Do not infer completion from time or unrelated provider state. |

The classic paid restriction is a release limit. Existing initial subscriptions retain their billing mode. A later supported path for classic paid Pause needs a separate decision and provider proof. This code performs no irreversible mode migration.

## Dates and quota

All server calculations use `family-time.ts`, including its dated zone overrides. SQL admission and shipment checks use the existing `_maya_family_window` mirror of the same family rule. The quote also binds the stored family location. The browser supplies the card setup id, requested weeks and opaque confirmation token. It supplies no year, dates, owner, price or provider id.

Each child has eight weeks per calendar year. The request uses the family's local year at admission. Pending requests reserve weeks. A confirmed provider refusal releases them. Applied weeks remain counted. The reservation and its target workbook number are private, durable rows.

A request through shipping day plus nine delays the next workbook. A later request leaves the next workbook unchanged and delays the workbook after it. The range stays a range. A later workbook with no shipping evidence has no invented range. The Workbooks tab, prepare admission and shipment boundary use the stored target. The delay moves the earliest and latest mailing days by the requested weeks. It also moves the next charge by the same local calendar weeks, retaining the local clock time. A seasonal clock change can change the elapsed UTC hours.

The shared child lock serializes controls and workbook writes. Preparation (a new `workbook_runs` or `workbooks` row) and shipment (a workbook set to shipped) are refused in two cases: the child has an open `plan_control_operations` row (a Pause or Cancel whose result is not known), or the stored cancellation flag `child_plan_controls.cancelled` is true. Only an applied Cancel sets that flag, and a successful paid Restart clears it. An open Restart in `plan_starts` does not block preparation or shipment. A plan that ended outside the application does not set the flag, so it does not block them either. Sibling billing and mailing records stay unchanged.

An outstanding mailing pause also applies to later workbook numbers. A printed target cannot be skipped. Parent mailing reads, preparation and shipment use `plan_mailing_obligations`. A shipment at or above a target satisfies that obligation. Applied cancellation and a successful paid Restart retire prior-plan mailing effects through `mailing_retired_at`. The pause rows remain in the yearly allowance count.

## Starts, cancellation and recovery

Every start uses `plan_starts`. Its mode, monthly cents, payment method and idempotency key are fixed by admission. The old initial-start entry point refuses repeat successful starts. The server also refuses an initial start when this card setup's Stripe Customer has any earlier subscription, or the card setup's latest start record is `started` or `other`. It does not check other Customers or the family's lifetime trial history; one free month per family is a separate change. A refused initial create can retry. An older open record without frozen price terms is recovered only by a matching subscription or a team check. New code does not replay it with guessed terms. An open initial start cannot become a paid Restart under its old key, or the reverse.

A Restart confirmation binds the next start generation and the control revision. A confirmation from an earlier generation cannot charge again after a later cancellation. The price is the lower of the saved agreed price and current `planPrice`. The first free month keeps the existing Stripe reminder seven days before it ends. Restart has no trial, reminder or seven-day charge delay.

A matched paid creation closes through the existing matching-key recovery. In the same database transaction, it creates `workbook_restart_requests`. The admin child page shows the request beside Prepare next workbook. A new preparation run links the request to its run. An existing run does not consume it. The existing workflow reads the current profile. No response says that generation already completed.

Pause has one durable operation and one family card hold with no expiry. Only the first admission sends a command. After a lost response, a retry reads the matching operation key and exact provider dates. The paid pause entry uses the operation UUID as its key. Stripe limits this key to 40 characters and rejects schedule metadata when `from_subscription` is set. Trial extension keeps its operation key in subscription metadata. It does not send another command. The next press after a reload also checks the pending operation. A request that never reached the provider stays pending for a team check. Time never releases its hold.

Cancel shares the same admission lock. It refuses while a start or another control is open. A scheduled pause is released before the subscription is cancelled at the end of its period. A paused plan ends immediately. Family and child deletion cancel the native schedule and its subscription together. A lost cancellation answer retains its operation and family hold.

Cancel admission changes the confirmation revision but preserves the last confirmed cancellation state. Only an applied resolution sets the permanent cancellation flag. A refused resolution removes the operation hold and preserves that prior state. The cancellation confirmation uses the current period end, separately from the delayed next charge date. After an applied Cancel, until the stored plan state catches up, the Account tab reads the plan as ending: a free month at its trial end, including a move by a free-month pause, and a paid plan at its period end, which a paid pause does not move, because Cancel releases the pause schedule first. An open control operation still reads as unknown. Pause dates match the stored plan by instant, not by text.

A complete provider list with no plan to cancel resolves the operation as refused. It keeps the prior confirmed cancellation state. A family waiting for its first plan can still prepare and start its first free month. When the provider read fails or is incomplete before any command was sent, the operation closes as refused and its family hold is released, so the parent can press Cancel again. If that close itself fails, the operation stays open and the team gets the alert below.

A definitive paid Restart refusal returns `payment_refused` only after the same durable generation reads as refused. The parent can update the card and review the price again. The Restart route holds the family (`family_card_operations`, keyed by the card setup) from before its provider reads, and releases that hold in a `finally` on every exit: a failed read before admission, a refusal, an unknown create result, or success. From admission on, the open `plan_starts` record refuses family deletion, so an unknown create stays protected after the hold is gone, until matching-key recovery (the next press, the webhook or the card sweep) or a team check (`team_end_plan_start`) closes it. Neither closure needs to release a route hold. A request that dies before its `finally` leaves the hold; the next Restart press on the same card setup takes the same hold and releases it. A failed release is logged.

Once a cancellation command was sent (a schedule release, a cancel or a cancel-at-period-end update) and its result is unknown, or a known result cannot be saved, the operation and its family hold stay open, and every later Cancel answers `pending`. The team gets an email through the existing delivery path at `SIGNUP_NOTIFY_EMAIL`, with the card setup id and the operation id; a missing address or failed send is logged. The open `plan_control_operations` row is the durable recovery record. There is no automatic close or public override. The team must prove that every intended provider command has ended before it calls `finish_plan_control` with that operation id. A current provider read alone does not prove that an earlier command stopped. Do not close an uncertain operation because it is old. Keep this limit in the release decision.

## Provider evidence and remaining checks

Stripe test-mode acceptance on 6 November 2026 found that the original paid Pause request was refused: Stripe rejects schedule metadata with `from_subscription`. A second check established the pause-entry key limit of 40 characters. The corrected request puts the operation UUID directly in the pause entry. Recovery requires that exact key, subscription, dates and settings. Public-interface regressions reproduce both provider restrictions and cover lost-response recovery.

The actual application functions then passed test-clock checks for first-trial extension, paid Pause at renewal, full payment and a new anchor on resume, failed resume remaining paused, release before Cancel, schedule cancellation during deletion, and immediate paid Restart with retry and decline. The trial check found no paid invoice at the old end and one full CAD 79.99 invoice at the new end. Paid Pause created no renewal charge during the pause and one full CAD 79.99 invoice at resume, with no proration. Test invoices do not move funds. This does not prove a real reminder email, production restricted-key permissions or the production webhook configuration. See the provider evidence added with the repair.

The test-clock checks in the paragraph above are done. Still outstanding, and needed before Savar starts the first customer's free month: the production restricted key's permissions, the production webhook configuration and a real Stripe trial reminder email.

Primary contracts read on 2026-11-05:

- [Pause schedules](https://docs.stripe.com/billing/subscriptions/pause/schedules)
- [Billing cycle changes](https://docs.stripe.com/billing/subscriptions/billing-cycle)
- [Collection pause](https://docs.stripe.com/billing/subscriptions/pause-payment)
- [Subscription schedules](https://docs.stripe.com/billing/subscriptions/subscription-schedules)

Local PostgreSQL probe: start a disposable socket server at `/tmp/pd559-postgres` on port 55559. Run `PD559_SOCKET=/tmp/pd559-postgres node supabase/tests/plan_controls.cjs --bootstrap`. Later runs omit `--bootstrap`. `--refresh` replaces the changed function bodies in that disposable fixture. It uses synthetic rows only.

The repair regressions use only socket `/tmp/pd-controls-bf76-pg`, port 55629, with TCP disabled. On a fresh disposable database, run these stages from the repository root:

```sh
PD559_SOCKET=/tmp/pd-controls-bf76-pg node supabase/tests/plan_controls.cjs --bootstrap
PD559_SOCKET=/tmp/pd-controls-bf76-pg node supabase/tests/plan_controls_repairs.cjs
PD559_SOCKET=/tmp/pd-controls-bf76-pg node supabase/tests/plan_controls_public.mjs
```

Set `PD559_DATABASE=pd559_<name>` for a separate database on that socket. Use the same value for each stage. The second stage installs the production admission, deletion fences, matching-key recovery, workbook start, shipment and printed-book guard functions. Supporting tables remain synthetic. The last stage uses a fake SDK transport and the unchanged pre-controls public `startPlan` from commit `89ecf73965eccbf0f59e49401b69cf09a4e12579`. It makes no provider call. The `.fixture` file runs only through that command because it requires this disposable SQL server.
