# Cancel recovery checks for issue #772

Date: 2026-11-09. Base: `bc6aeb63`.

## Failure controls

- Without the admin close implementation, all nine public-interface admin checks failed.
- With the old request close, the test that requests family deletion during the Stripe read failed at the family fence.
- With the sweep disabled, four alert checks failed. These include a lost admission answer and a process stopped after admission.
- Before the reminder route called the sweep, its integration check failed because the response had no cancellation sweep result.
- Before the migration, the rolled-back hosted probe failed because the recovery functions did not exist.

## Evidence

- Cancel request: a simulated Stripe SDK transport proves the admission, unknown-write, close, and alert behavior. It passes through the actual public Cancel function. It makes no provider request.
- Sweep: concurrent and repeated runs prove one delivery per operation through a synthetic database transport. A refused send can retry. An unknown send stays claimed. A claim that crosses the send deadline sends nothing and is released.
- Admin action: a simulated Stripe SDK transport proves applied and refused outcomes, a failed read, the minimum age, and family scope. It proves that the action sends no Stripe write. It does not prove production Stripe permissions.
- Database: migration `20261109180404` was applied through Supabase MCP. `list_migrations` confirmed it. The synthetic hosted probe passed and rolled back. It checks normal and fenced closes, hold release, retry, alert claims, admin-only listing, foreign-family refusal, narrow fence changes, and service-only grants. It deletes no family.
- Compatibility: hashes of `finish_plan_control`, `admit_plan_cancel`, `assert_family_writable`, `fence_family_write`, and `fence_child_delete_write` matched before and after application. The hosted probe also checks that the old close still refuses a fenced family.
- Types: `npm run db:types` generated the committed database types after application.
- Browser: Aside checked the real client component on a temporary local page with sample data and simulated action responses. The button displayed the applied, refused, and unreadable-Stripe messages. The test tab was closed. The server was stopped. The temporary page was removed. This is component behavior evidence, not a signed-in hosted operator check.

The focused Vitest selection passed 51 checks across seven files with `--maxWorkers=2`. All heavy commands used the shared gate slot. The full suite was not run.

Changed-file ESLint, `next typegen`, `tsc --noEmit`, and the single final `npm run build` passed.

## P1 review repair: prove the promised cancellation

The reviewed head was `81a297bb92c3751bcde087e08ad8f171f1ce3aa8`. The admin check accepted any positive `cancel_at` or any `cancel_at_period_end` flag. This could close the operation as applied while Stripe could still charge.

Both reported cases failed as public-interface regressions before the repair:

- An active plan with period end `1900000000`, cancellation at `1905000000`, and no period-end cancellation returned applied. It must return refused because it can renew before cancellation.
- A past-due plan with period-end cancellation returned applied. It must return refused because D-222 requires immediate cancellation to stop collection.

`cancelPlan` and the recovery check now share `planCancelTerms` for the status rule and promised end. The Cancel command retains its existing provider commands and end dates. Recovery accepts a trial or active plan only when cancellation takes effect at that trial or paid-period end. A period-end flag with no conflicting explicit date is valid. An explicit cancellation at exactly that end is also valid. A later or earlier explicit date is refused, including when the flag is true. Failed-payment, incomplete, and paused plans require Stripe status `canceled`. Unknown statuses are refused.

A subscription with an attached controlling schedule is refused. This includes a scheduled pause and resume. Cancel must first release that schedule. Recovery also refuses a collection pause. Every subscription except one with status `incomplete_expired` must pass the check. An older canceled subscription cannot hide a running subscription that fails it. An unreadable Stripe response still leaves the operation open. Recovery sends no Stripe write.

The new checks use `checkOpenCancel` through simulated Supabase and Stripe SDK transports. They cover both regressions, exact and conflicting dates, different trial and paid-period ends, the public Cancel result for all six supported running statuses, scheduled pause and resume, collection pause, and two running subscriptions. They also check the state sent to `close_plan_cancel`.

Two local mutations each caused the relevant regression to fail with exit code 1:

- Accept any positive `cancel_at`: the active-plan regression returned applied.
- Accept a past-due plan with `cancel_at_period_end`: the past-due regression returned applied.

Both mutations were restored before final validation. These checks prove local behavior at simulated service boundaries. They do not prove live Stripe state, hosted operator access, or a real family's result. This repair made no live Stripe call, family change, email delivery, database migration, or setting change.

Final repair checks on Savars-MacBook-Pro:

- `gate-slot.sh npx vitest run src/lib/plan-cancel-admin.test.ts src/lib/plan-cancel.test.ts src/lib/plan-cancel-recovery.test.ts --maxWorkers=2`: exit 0, 61 tests across three files passed after both mutations were restored.
- `gate-slot.sh npx eslint src/lib/plan-cancel-admin-server.ts src/lib/plan-cancel-admin.test.ts src/lib/stripe-subscriptions.ts src/lib/stripe.ts`: exit 0.
- `gate-slot.sh npm run build`: exit 0. One build ran after the final tests and lint check. Compilation, TypeScript, and generation of 142 static pages passed.

The admin checks prove the read-only decision and close state. The Cancel checks prove its provider command shape, status handling, schedule release order, and reported end dates. The request-recovery checks prove admission, unknown-write holds, and close behavior through simulated transports. None of these checks proves a live provider or family result. GitHub CI runs the full suite.
