# Referral settlement repairs

Machine: Savars-MacBook-Pro-5. Rejected candidate: 26f41b2ed943b4d0ced4efe2e40a199997544b98. This is a builder repair record, not independent approval.

The settlement report found two payment failures that the memory seam did not reject. `scripts/referral-settlement-sql-local.mjs` now drives public payment functions through the actual SQL. All three cases failed before repair and passed after repair:

1. A zero initial invoice is replayed after its entitlement funds another renewal. The later payment now records its receipt and earns one reward. The old operation remains absent.
2. A used initial operation retains its subscription creation key. A later renewal pays at full price during a coupon-write race. Only the renewal reservation is released. Its deletion hold is removed. The next renewal can use the benefit.
3. Sixty earlier rewards belong to deleted, deletion-requested or deletion-queued owners. A current waiting recipient remains visible in two bounded due reads.

The core binds a definitive unused creation directly as absent. Renewals cannot use the subscription creation key. The Stripe adapter exposes that key only for `subscription_create`. SQL selects an explicit operation first, then the exact invoice, with a creation-key fallback only for an unbound or matching initial invoice. Used and absent states are terminal. The memory store follows those transitions. Recipient eligibility is filtered before email ordering and limit.

The first migration remains unchanged after its application. Additive migration `20261114014837_referral_settlement.sql` replaces the command function. Its hosted history entry is `20261114015329_referral_settlement`. The expanded hosted rollback probe passed. It checks terminal replay after reuse, exact-invoice selection against a competing creation key, refusal to rebind a creation to another invoice, and the queue behind 40 removed/deleting owners. The local public-function control also covers a queued deletion marker. Database types were regenerated after application. No schema type changed in this function-only migration.

Four focused files passed, 56 tests. A new SDK transport case failed before the adapter repair and passed after it. The original local rollback probe also passed. Full gate results before these settlement repairs were 692 files and 21,028 passing tests, one skipped, plus ESLint and build. The new full gate passed for these repairs: 692 files, 21,029 passing tests, one skipped, ESLint and production build. The complete log is `.design/evidence/referrals/final-gate.log`. A fresh Stripe test-mode run passed 12 checks, including actual initial and renewal creation-key behavior. Its synthetic clock and customers were removed.

Parent and admin Aside checks passed. Hosted RLS controls passed. Screenshots and the access-control JSON are in `.design/evidence/referrals/`. The synthetic browser users and parent rows were removed. No customer email, live Stripe write, push or application deployment occurred. Live Stripe webhook subscriptions and key permissions remain unverified because Vercel redacted the production key.

REFERRAL_SETTLEMENT_REPAIRS_DONE
