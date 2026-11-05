# Pause and paid Restart implementation report

Source candidate is committed with this report. The external report at `/tmp/pd-plan-controls-implementation-report.md` records its exact final commit after the commit is made. Hosted acceptance is pending.

## Identity

- Machine: Savars-MacBook-Pro-5.local.
- App-created worktree: /Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-d34219bc.
- Physical worktree: /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-d34219bc.
- Branch: t3/implement-plan-controls-1.
- Base: 89ecf73965eccbf0f59e49401b69cf09a4e12579.
- One implementation agent worked here. No delegate or new checkout was started.
- No push, PR, merge, watch, browser, hosted service mutation, credential read, email or paid call occurred.
- The dashboard release remains off. Tracked instruction and skill files remain unchanged.

## Changes

Pause now uses a private durable operation, a yearly reservation and a stored target workbook number. The server computes the family year, mailing range and charge date. Confirmation binds the current book, delivery correction, family location, allowance and provider charge boundary. Concurrent requests use the same child lock. The first request alone sends a provider command. Unknown outcomes retain the reservation and a family hold with no expiry. Matching metadata and dates can recover both an attached and a completed, released schedule.

The day-nine cutoff is binding. Early requests move the next mailing range. Late requests leave it unchanged and delay the following book. The Workbooks tab, Account plan dates, preparation admission and shipment check read the authoritative state. The new run guard takes no child lock on a heartbeat, so it preserves the existing run lock order. Sibling billing and mailing records stay unchanged.

Paid Restart reuses `plan_starts`, matching-key recovery, family/child fences and newest-card convergence. Mode, price and card are fixed by admission. It charges immediately at the saved agreed price lowered by `planPrice`, with no trial or future anchor. A confirmation binds its generation and control revision. An older confirmation cannot create a later generation. Existing initial start paths refuse a repeat free month. Older open records without frozen price terms remain recoverable but are not replayed with guessed terms.

A successful paid start creates an actionable `workbook_restart_requests` row in the same transaction as start resolution. The admin child page shows it beside the existing Prepare next workbook action. A new run links the request. It does not claim that generation finished. The existing job reads the current profile.

Cancel shares admission with Pause and Restart. A pending command refuses cancellation. A known pause schedule is released before period-end cancellation. Child and family deletion cancel a native schedule and its subscription together. A lost cancellation answer retains its durable hold. The Cancel button no longer reports every HTTP 409 as success.

The Account and Plan pages keep pending recovery actions visible after reload. Both new APIs enforce origin, JSON, session, dashboard access and ownership. The existing proxy applies the desk restriction to their account paths. The public responses omit provider ids and private snapshots.

The existing Stripe reminder stays seven days before the FIRST free month ends. Restart has no new reminder, free month, seven-day delay or grace period.

## Supported provider matrix and limits

- First free month: extend its existing trial end with `proration_behavior=none`.
- Paid flexible subscription: one licensed monthly CAD item, automatic collection, no existing schedule. Create native pause at renewal and resume after the requested calendar weeks. Use `resume_at`, `resume_on_payment_success`, no usage charge, no unused-time credit and no proration.
- Classic paid plans, existing schedules, mixed items, ending plans and failed payments: refuse Pause safely. No mode migration occurs. This is an explicit release limit.
- New paid Restart: create a flexible subscription with `payment_behavior=error_if_incomplete`. This is a new subscription, not a migration of an existing one.
- An uncertain cancellation requires a team check. There is no automatic close or public override. A read of unrelated provider state or elapsed time is not proof that the command stopped.
- Paid generation, hosted schema, real API acceptance, browser rendering and independent review remain outside this task.

Primary Stripe contracts and parent acceptance steps are in `docs/plan-controls.md`. The parent must verify first-trial extension, native renewal/resume invoices, failed resume, release before Cancel, deletion and restricted-key permissions in test mode. Keep release off until that evidence passes.

## Verification

- Targeted regressions: 31 files, 605 passed, 0 failed. Exact scope and counts are in `validation.json`. The full 16k suite was not run.
- Local PostgreSQL: 12 cases passed, `PLAN_CONTROLS_PROBE_OK 12`. The probe uses a disposable Unix socket and synthetic rows. It applies the complete additive migration to its fixture. Two connections test concurrent admissions and deletion races. It checks service grants, quota, stale dates/location, early/late targets, sibling writes, family/child fences, cross-mode terms and the durable workbook request.
- ESLint: `npx eslint src` exited 0 with no output.
- Compilation: a clean-environment production bundle compiled. The build exited 1 at generated database types. All 16 final diagnostics concern the missing new tables/RPCs and their dependent column inference. No provider SDK, React, Next route, shared type or test type error remains in this output. The exact diagnostics are in `validation.json` and `/tmp/pd559-build.log`.
- `git diff --check` passed before the commit.

Failing-before evidence: the new repeat-start regression first failed because an ended plan started another free month. It passed after the fix. The new pause-date suite initially failed because the module did not exist. Later checks found a deletion fixture that lacked the new subscription read. Code review also found that the unknown plan state hid a lost-response recovery button. The fixture and UI were corrected. The added UI regression passes. This report does not claim every new case was run against the unmodified base.

One line per subsystem:

- Dates and allowance: pure public functions and two-connection SQL prove the rules and atomic reservations. They do not prove hosted permissions or provider invoice timing.
- Provider adapter: the real Stripe SDK over fake transport proves outgoing fields and exact recovery checks. It does not prove API acceptance.
- Restart and card: synthetic public calls prove one key, no second trial, price bounds, refused retries, late matching-key recovery and newest-card convergence. They do not prove a real card charge.
- Deletion and cancellation: local SQL and fake provider paths prove holds and schedule traversal. They do not prove a hosted worker run or a real schedule cancellation.
- Parent views and controls: public reader and synthetic DOM tests prove changed ranges, date previews, pending recovery and visible refusal. They do not prove layout, focus or a real browser session.
- Workbook preparation: local SQL proves a durable request and new-run linkage. It does not run generation or validate a generated workbook.

## Parent steps

1. Apply and verify `supabase/migrations/20261105234500_plan_controls.sql` on the hosted project. Check the new grants and guards against documented platform behavior.
2. Generate `src/lib/database.types.ts` from the hosted schema. Do not hand-edit it. The new calls need `plan_control_context`, `plan_control_operation`, `admit_plan_pause`, `finish_plan_control`, `admit_plan_cancel`, `plan_start_terms` and `admit_plan_start_terms`. The new tables are `child_plan_controls`, `plan_control_operations` and `workbook_restart_requests`; `plan_starts` adds `purpose` and `monthly_cents`.
3. Run the full done gate once after types are generated. Add `customer.subscription.paused` and `customer.subscription.resumed` to the webhook event configuration before release.
4. Run the provider test-mode checks in `docs/plan-controls.md`. No live plan mutation is authorized by this report.
5. Run the browser checks listed in `.design/experiments/r559/manifest.json`. Review desktop, phone, keyboard, error and recovery states.
6. Obtain the independent adversarial review. Keep the dashboard release off. The parent owns any later PR and merge decision.

## Files

- `.design/experiments/r559/implementation-contract.md`
- `.design/experiments/r559/implementation-report.md`
- `.design/experiments/r559/manifest.json`
- `.design/experiments/r559/validation.json`
- `docs/parent-dashboard.md`
- `docs/plan-controls.md`
- `docs/stripe-webhook.md`
- `src/app/(product)/account/(dashboard)/plan/page.test.ts`
- `src/app/(product)/account/(dashboard)/plan/page.tsx`
- `src/app/(product)/admin/children/[id]/page.tsx`
- `src/app/api/account/plan/controls.test.ts`
- `src/app/api/account/plan/pause/route.ts`
- `src/app/api/account/plan/restart/route.ts`
- `src/components/account-billing.tsx`
- `src/components/account-plan.test.ts`
- `src/components/account-plan.tsx`
- `src/components/plan-text.tsx`
- `src/lib/billing-memory.ts`
- `src/lib/billing-server.test.ts`
- `src/lib/billing-server.ts`
- `src/lib/billing.test.ts`
- `src/lib/billing.ts`
- `src/lib/card-reconcile-server.ts`
- `src/lib/card-reconcile.test.ts`
- `src/lib/card-reconcile.ts`
- `src/lib/family-delete-server.test.ts`
- `src/lib/family-deletion-store.ts`
- `src/lib/next-book.ts`
- `src/lib/parent-plan-server.ts`
- `src/lib/parent-plan.test.ts`
- `src/lib/parent-plan.ts`
- `src/lib/parent-view-server.test.ts`
- `src/lib/parent-view-server.ts`
- `src/lib/parent-view.test.ts`
- `src/lib/parent-view.ts`
- `src/lib/plan-cancel.test.ts`
- `src/lib/plan-control-request.ts`
- `src/lib/plan-controls-server.test.ts`
- `src/lib/plan-controls-server.ts`
- `src/lib/plan-pause-memory.ts`
- `src/lib/plan-pause-stripe.test.ts`
- `src/lib/plan-pause-stripe.ts`
- `src/lib/plan-pause.test.ts`
- `src/lib/plan-pause.ts`
- `src/lib/plan-restart.test.ts`
- `src/lib/plan-state.ts`
- `src/lib/stripe-subscriptions.ts`
- `src/lib/stripe.ts`
- `supabase/migrations/20261105234500_plan_controls.sql`
- `supabase/tests/plan_controls.cjs`
