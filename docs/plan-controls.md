# Family pricing, Pause and paid Restart

The dashboard stays off for real families. The existing test and admin access rule applies to both new routes. The parent must apply `20261105234500_plan_controls.sql`, generate database types, run the full checks, check the browser and obtain an independent review before release.

## Family admission (D-306)

The first child whose plan starts pays CAD 79.99 each month. Every other child pays CAD 59.99 each month. There is no child limit. The first owner stays the first owner after cancellation or child deletion. A sibling price never rises. Admission takes the lower of that rate, the current plan price, the saved agreed price, and the child's earlier admitted price.

The family has one shared 30-day window from its first initial plan admission. A sibling admitted within it receives only its remaining time. Stripe gets the absolute `trial_end`. A sibling admitted after it pays immediately, with `error_if_incomplete` and no trial fields. A Restart always pays immediately, including within the original window. For example, Kai starts November 10 and a sibling starts November 20. Both trials end December 10. Kai then pays CAD 79.99 and the sibling pays CAD 59.99.

`admit_family_plan_start` is the one admission for the admin start and Restart. It takes the exclusive parent lock before the child or card locks. It freezes the amount, trial end, payment method and idempotency key in `plan_starts`. `family_plan_windows` stores the first owner and the shared window. `child_plan_prices` stores each child's admitted amount. These tables reference the parent, but have no child or card foreign key. Child deletion cannot erase their history. Family deletion still removes the family records.

The first create reserves the family before Stripe is called. While its result is uncertain, another child receives no admission. After confirmation, concurrent siblings can each start at CAD 59.99 under the same window. A duplicate first press receives the same generation and key. Only a confirmed Stripe refusal releases an unconfirmed reservation. Time and a team closure alone do not release it. A first start that is still uncertain after a team closure requires proof of provider refusal before the family can receive a new admission.

Known earlier starts and provider states are recorded when the migration runs. An older provider state without an exact start time receives no invented free-window dates. It preserves the consumed offer and the price limit for Restart. This change does not change an existing Stripe subscription's price. It cannot recover history already removed before this migration.

Pause still moves only the selected child's dates. It never changes `family_plan_windows`. A later sibling therefore receives the original family end even if the first child has paused.

The current CAD 79.99 and CAD 59.99 monthly prices are created on first use on `unica_math`. The server finds them with `unica_math_cad_monthly_7999` and `unica_math_cad_monthly_5999`. It verifies the product, amount, currency and licensed monthly recurrence. An older lower agreed offer uses its existing inline amount. Price lookup or create failure leaves the admission reserved.

The old admission entry point retains main's original one-child price, timestamp and response fields. Its sibling stop is deliberate and fails closed. PR B uses the separate `admit_family_plan_start` and `family_plan_start_terms` names. Only that opt-in path imports legacy history. Main's one-child initial start and Restart passed a six-case rolled-back live comparison against the original functions. See `docs/family-plan-pricing-live-compatibility.md` for the replaced-function list, exact results and the existing pending/sent email state.

The checkout, report and card-saved welcome describe the one shared window. The report action says Start plan. These new customer words await Savar in the PR body. The start email reads the frozen amount and first charge date from the start record. Its immediate-payment form does not claim free time or a seven-day reminder. The plan page and Account tab continue to use the child's provider or stored plan amount and date. The admin card shows the current stored plan amount and its start's first charge date. A trial pause uses the child's updated charge date.

Migrations `20261109032547_family_plan_pricing.sql`, `20261109040516_family_plan_legacy_shape.sql`, `20261109041204_family_plan_history_admission.sql` and `20261109042134_family_plan_legacy_window.sql` were applied to `cdjobwsyzndtltzfpyqa`. The migration and a synthetic admission probe passed inside a rolled-back transaction first. The same synthetic probe passed after application and was rolled back. Official database types were generated with `npm run db:types`. No Stripe request was made by that SQL probe.

Local regression commands use a disposable socket database only. Initialize the existing `plan_controls.cjs` fixture on socket `/tmp/pd559-postgres`, port 55559, database `pd559_family_pricing`. Add the fixture's missing `card_setups.price` and `child_plan_states` columns before applying this migration. Then run `PD559_SOCKET=/tmp/pd559-postgres PD559_DATABASE=pd559_family_pricing node supabase/tests/family_plan_pricing.cjs`. Use `--installed` on later runs. The baseline control uses `--baseline` before the migration. It fails because all three children receive 7999 cents.

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

The shared child lock serializes controls and workbook writes. A pending control blocks prepare and shipment until its result is known. A successful cancellation blocks new preparation and shipment for that child. Sibling billing and mailing records stay unchanged.

An outstanding mailing pause also applies to later workbook numbers. A printed target cannot be skipped. Parent mailing reads, preparation and shipment use `plan_mailing_obligations`. A shipment at or above a target satisfies that obligation. Applied cancellation and a successful paid Restart retire prior-plan mailing effects through `mailing_retired_at`. The pause rows remain in the yearly allowance count.

## Starts, cancellation and recovery

Every start uses `plan_starts`. Its mode, monthly cents, payment method and idempotency key are fixed by admission. The old initial-start entry point refuses repeat successful starts. The server also refuses an initial start when any earlier provider subscription exists. A refused initial create can retry. An older open record without frozen price terms is recovered only by a matching subscription or a team check. New code does not replay it with guessed terms. An open initial start cannot become a paid Restart under its old key, or the reverse.

A Restart confirmation binds the next start generation and the control revision. A confirmation from an earlier generation cannot charge again after a later cancellation. The price is the lower of the saved agreed price, current `planPrice`, and the durable family admission price. The first free month keeps the existing Stripe reminder seven days before it ends. Restart has no trial, reminder or seven-day charge delay.

A matched paid creation closes through the existing matching-key recovery. In the same database transaction, it creates `workbook_restart_requests`. The admin child page shows the request beside Prepare next workbook. A new preparation run links the request to its run. An existing run does not consume it. The existing workflow reads the current profile. No response says that generation already completed.

Pause has one durable operation and one family card hold with no expiry. Only the first admission sends a command. After a lost response, a retry reads the matching operation key and exact provider dates. The paid pause entry uses the operation UUID as its key. Stripe limits this key to 40 characters and rejects schedule metadata when `from_subscription` is set. Trial extension keeps its operation key in subscription metadata. It does not send another command. The next press after a reload also checks the pending operation. A request that never reached the provider stays pending for a team check. Time never releases its hold.

Cancel shares the same admission lock. It refuses while a start or another control is open. A scheduled pause is released before the subscription is cancelled at the end of its period. A paused plan ends immediately. Family and child deletion cancel the native schedule and its subscription together. A lost cancellation answer retains its operation and family hold.

Cancel admission changes the confirmation revision but preserves the last confirmed cancellation state. Only an applied resolution sets the permanent cancellation flag. A refused resolution removes the operation hold and preserves that prior state. The cancellation confirmation uses the current period end, separately from the delayed next charge date.

A complete provider list with no plan to cancel resolves the operation as refused. It keeps the prior confirmed cancellation state. A family waiting for its first plan can still prepare and start its first free month. An incomplete list or failed provider read leaves the operation and hold open.

A definitive paid Restart refusal returns `payment_refused` only after the same durable generation reads as refused. The route then releases its card-operation hold. The parent can update the card and review the price again. A failed result save or an unknown provider result retains the holds and the recovery action.

A pending cancellation currently needs a team check. There is no automatic close or public override. The team must prove that every intended provider command has ended before it calls `finish_plan_control`. A current provider read alone does not prove that an earlier command stopped. Do not close an uncertain operation because it is old. Keep this limit in the release decision.

## Provider evidence and remaining checks

Stripe test-mode acceptance on 6 November 2026 found that the original paid Pause request was refused: Stripe rejects schedule metadata with `from_subscription`. A second check established the pause-entry key limit of 40 characters. The corrected request puts the operation UUID directly in the pause entry. Recovery requires that exact key, subscription, dates and settings. Public-interface regressions reproduce both provider restrictions and cover lost-response recovery.

The actual application functions then passed test-clock checks for first-trial extension, paid Pause at renewal, full payment and a new anchor on resume, failed resume remaining paused, release before Cancel, schedule cancellation during deletion, and immediate paid Restart with retry and decline. The trial check found no paid invoice at the old end and one full CAD 79.99 invoice at the new end. Paid Pause created no renewal charge during the pause and one full CAD 79.99 invoice at resume, with no proration. Test invoices do not move funds. This does not prove a real reminder email, production restricted-key permissions or the production webhook configuration. See the provider evidence added with the repair.

The parent must use Stripe test mode and a test clock to verify the first-trial extension, the next-renewal invoice, the full resume invoice, failed payment on resume, release before Cancel, schedule cancellation during deletion, and the restricted key's permissions. Check that no credit, refund, new trial email or earlier charge occurs. Keep the dashboard off until these checks pass.

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
