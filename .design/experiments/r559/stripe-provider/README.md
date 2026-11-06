# Stripe provider acceptance and repair

Machine: `Savars-MacBook-Pro-5.local`.
Worktree: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/site-pd-plan-controls`.
Branch: `site/pd-pause-provider`.
Base: `f3133376535b3c96f4c81f62f1f8d1cc80322a23`.
Stripe SDK: 23. API version: `2026-09-30.endive`.

## Binding failures

The real Stripe test API refused the original paid Pause create with `You cannot set metadata if from_subscription is set`. The synthetic SDK transport now enforces that restriction. Three cases failed on the original source. See `original-refusal.json` and `metadata-before.log`.

The first repair used `plan-pause-` plus the operation UUID as the pause entry key. The real API refused that 47-character value. Stripe permits at most 40 characters. A full-UUID public regression failed on that repair. See `pause-key-limit.json` and `key-before.log`.

The final request uses the 36-character operation UUID directly as the pause entry key. It sends no schedule metadata with `from_subscription`. Recovery requires the exact key, subscription, dates and payment settings. It also searches detached schedules. A lost create response does not trigger another write. Trial extension continues to use subscription metadata.

## Actual provider results

These checks used the exported `stripePauses`, `startPlan`, `cancelPlan` and `stopPlanNow` functions with a real Stripe test client. Only the card-row store was in memory. The test key prefix, account id and `livemode=false` were checked before writes. Customers had no real name, email or address. Test cards and clocks moved no funds. No live Stripe write or paid AI call ran.

| Case | Result |
| --- | --- |
| First trial extension | Same subscription and trial start. No paid invoice at the original end. One full CAD 79.99 payment at the extended end. No proration. |
| Paid Pause | Native pause applied at renewal. Status became paused. No renewal payment during the pause. |
| Successful resume | Status became active after a full CAD 79.99 payment. Billing anchor became the resume date. No credit or proration. |
| Failed resume | A declined test card left the subscription paused, with one open unpaid CAD 79.99 invoice. |
| Cancel scheduled Pause | Schedule released first. Cancellation kept the original period end. No payment or resume after the former resume date. |
| Delete paused plan | Schedule and subscription cancelled. No extra invoice or later resume. |
| Paid Restart | Immediate full CAD 79.99 payment, no trial fields, no trial email record. Retry created no second subscription or invoice. |
| Declined Restart | Public result was payment_refused. Durable generation was refused. No live subscription remained. |

`trial-extension.json` records the trial check. Its final cleanup attempted to archive an inline price, which Stripe forbids. That is a harness cleanup limit. The clock and customer were already deleted. The runner was corrected to delete the owned clocks and customers without changing immutable inline prices. `paid-matrix.json` records all five later scenarios. The 402 card_declined response in that report is the expected decline control.

`cleanup.json` independently re-read all nine clocks and nine customers from all runs, including both refusal runs. All clocks were absent and all customers were deleted. Stripe retains immutable inline price and payment history. No active customer or subscription from this run remains.

## Reproduction and limits

`runner.ts.txt` is the sanitized test runner. Copy it to a temporary `.ts` file. Set `PD_STRIPE_TEST_KEY_FILE` to a private file with a test key. Bundle it with the installed esbuild, this repository's tsconfig and packages external. Alias `server-only` to an empty module for this standalone server runner. Use this repository's node_modules through NODE_PATH. Do not substitute fake provider responses. The runner supports `PD_STRIPE_SCENARIOS` and `PD_STRIPE_REPORT` to limit a rerun and keep its report separate. It asserts the intended test account before any mutation. Do not use a live key.

Provider tests prove the recorded synthetic card scenarios, request acceptance and invoice timing. They do not prove real reminder delivery, real bank behavior, production key mapping, production webhook events, provider model accuracy or release activation. The existing seven-day first-free-month reminder remains unchanged. Paid Restart has no free month or additional reminder.

The source-only repair changes no SQL, parent screen or route contract. Existing browser evidence for the controls remains applicable. The new browser work audits Stripe's hosted configuration. Full-gate results and independent review are recorded separately when complete.

## Complete local gate

The corrected source passed 51 focused tests across six files, then 16,613 tests across 441 files with one optional skip. The full run used four workers and took 249.61 seconds. Source ESLint and the production build exited zero. No assertion or timeout was relaxed. The full gate proves local integration and type compatibility. It does not prove live configuration or activation.

The initial hosted configuration audit found the named site key has Subscriptions Write and Invoices Write. No permission changed. Vercel masks its stored key, so its exact mapping was not independently confirmed. The live webhook initially listened to five events. The later authorized configuration work added paused and resumed to that same destination. See hosted-configuration.md for the saved state and proof limits.

## SPEC-1 correction

The independent Spec review at2c3ce6bb found that the pause matcher accepted changed credit/usage/invoicing settings. The omission also existed in the base. Seven public confirmPause regressions failed before the correction and pass after it. A mismatch now stays pending and does not close the durable hold or send another command. The matcher compares the four pause settings and the existing three resume settings.

A new actual Stripe test-mode native Pause verified that the response contains the exact required pause settings, so the stricter comparison does not reject the supported provider response. Its owned clock and customer were deleted. The earlier complete billing matrix remains the invoice-timing evidence. The corrected local gate passed16620 tests across441 files, with1 optional skip, in266.48seconds. Source lint and production build exited0. These logs are prefixed billing-settings. The scoped independent recheck approved the correction at ef617b04. See review-final.md.

## Current main integration

The reviewed feature files remained unchanged after the rebase onto main 3855e203bb6dce30a54483511846257df98659d7. The local gate passed 16,667 tests across 443 files with one optional skip in 333.89 seconds. Source lint and the production build exited zero. The main669 logs record this run. These checks prove local integration. They do not prove production activation or webhook delivery.
