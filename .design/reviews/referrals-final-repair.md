# Final referral repair

Machine: Savars-MacBook-Pro-5. The last independent report reviewed 35bfc5f7d1d0a9f8189278455b7a381d07c9b097. It resolved the three earlier findings and found one P2 payment race.

The adapter now returns `committed` when withdrawal reads a paid invoice that still has the reserved coupon. The core keeps that operation applied until its current paid receipt marks it used. The SQL guard for genuinely absent operations stays unchanged.

The independent reviewer tested this exact proposed return change in memory. Its complete actual-adapter plus SQL race control then passed. The controller applied that one-line repair. The final code was not sent to another independent reviewer.

Two permanent controls failed before repair and passed after repair:

- The public SDK adapter test changes the invoice to paid after the first read and before withdrawal. Withdrawal must return committed and make no further provider write.
- `scripts/referral-settlement-sql-local.mjs` drives the public core, actual SDK adapter and actual command SQL. Payment completes at withdrawal. The operation stays applied, the next paid read marks it used, and the actual admin correction preview reports one used benefit.

All four SQL settlement controls pass. Four focused files pass, 57 tests. The final full gate passed: 692 files, 21,030 tests, one skipped, ESLint and build. The saved log is `.design/evidence/referrals/final-gate.log`. Thirteen refreshed Stripe test-mode checks passed, including the actual paid-withdrawal branch. Its synthetic clock and customers were removed. These controls use synthetic transport timing. They do not establish a measured Stripe race or hosted concurrency.

All reported findings have a repair and a binding regression control. The independent report remains a FAIL for its original pin. This controller record does not relabel it as an independent PASS.

REFERRAL_FINAL_REPAIR_DONE
