# Referral settlement recheck

VERDICT: FAIL

All three reported settlement findings are resolved. One new P2 defect remains. A payment that completes during revocation can leave a used discount recorded as absent. The admin correction preview then reports an incorrect used-benefit count.

## Scope and pins

- Machine: Savars-MacBook-Pro-5.local.
- Prepared checkout: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-332f8ab5-614b4bc8b9d8885e`.
- Physical checkout: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-332f8ab5-614b4bc8b9d8885e`.
- Branch, read before review: `t3/referral-settlement-recheck`.
- Candidate HEAD: `35bfc5f7d1d0a9f8189278455b7a381d07c9b097`.
- Rejected candidate: `26f41b2ed943b4d0ced4efe2e40a199997544b98`.
- Base: `5b09bcf91ea3328106e61d2d9c0aab6a147662d3`.
- The rejected candidate is an ancestor of HEAD. The merge base with the specified base equals that base.
- Runtime: Codex, gpt-6.1-sol, high reasoning effort. Required provider assignment: `codex_aedfb650-7bcd-4660-98d3-5349e5edb462`. I did not query account configuration or change accounts.
- The tree was clean at entry and at the final check before report creation.

I read AGENTS.md, the complete settlement report, repair round 3, both referral documents, the repair diff, and the SQL scripts before execution. I inspected the complete replacement command function against the original function. I decoded the changes in the long report snapshots separately.

I used the prepared Mac checkout. I did not delegate, retry the PC, install dependencies, create dependency links, read environment files or secrets, call hosted services, or write product files. Only this report was written.

## Rejection conditions stated before checks

The recheck must reject a late zero invoice that reactivates an operation, a full-price renewal that retains its reservation or deletion hold, or removed recipients that fill the bounded email queue. It must also reject an incorrect terminal transition, loss of a confirmed payment result, loss of uncertain-operation recovery, or a reduction in access or privacy controls. A test that also passes on the defective implementation cannot establish repair.

The fresh controls use public domain functions and the actual migration SQL. The additional race control uses the actual Stripe adapter through its SDK transport boundary. All provider responses are synthetic.

## Settlement of the three findings

| Finding | Status | Fresh evidence |
| --- | --- | --- |
| P1: Late zero-invoice replay after benefit reuse | RESOLVED | The old creation stays absent after another invoice reserves its entitlement. The later payment becomes used, records the first qualifying invoice, and earns exactly one reward. The same control fails on the rejected core and original SQL with the entitlement unique-index error. |
| P1: Retained subscription start key selects an old operation | RESOLVED | The full-price renewal alone becomes absent. Its family hold is removed. The next renewal can reserve the benefit. The rejected implementation leaves the renewal reserved. The SDK transport test also fails on the rejected adapter because a renewal returns `start-1` instead of null. |
| P2: Deleted or deleting recipients block the email limit | RESOLVED | Twenty deleted owners, twenty deletion-requested owners, and twenty queued-deletion owners precede one current owner. Both bounded reads return that current owner. The rejected SQL returns zero emails. |

The changes address each failure at its selection or transition point:

- `src/lib/referrals.ts:128` binds a definitive unused creation directly as absent. It excludes renewal invoices from the creation-key path.
- `src/lib/referral-stripe.ts:83` exposes the creation key only for `subscription_create`.
- `supabase/migrations/20261114014837_referral_settlement.sql:174` selects an explicit operation first, then an exact invoice. Only `start_result` can use an unbound or matching creation key.
- The email query filters current recipient eligibility before ordering and limiting.

## Confirmed new defect

### P2: The new absent-state guard permanently discards a paid discount receipt

Primary location: [supabase/migrations/20261114014837_referral_settlement.sql:185](/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-332f8ab5-614b4bc8b9d8885e/supabase/migrations/20261114014837_referral_settlement.sql:185).

Related paths: [src/lib/referral-stripe.ts:136](/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-332f8ab5-614b4bc8b9d8885e/src/lib/referral-stripe.ts:136), [src/lib/referrals.ts:201](/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-332f8ab5-614b4bc8b9d8885e/src/lib/referrals.ts:201), and [src/lib/referrals-memory.ts:98](/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-332f8ab5-614b4bc8b9d8885e/src/lib/referrals-memory.ts:98).

Concrete sequence:

1. Family Q's qualifying payment earns a reward for family P.
2. P's draft renewal receives that reward's coupon.
3. Q's current payment risk becomes revoke, such as after a full refund.
4. Reconciliation reads P's invoice before payment completes.
5. The invoice becomes paid with the coupon before the adapter's withdrawal read.
6. The actual adapter sees `raw.status === "paid"` and returns undefined.
7. The core interprets that result as `detached`. SQL records the revoked operation as absent.
8. A later public reconciliation reads the paid invoice and submits `finish: used`.
9. The new terminal guard returns without recording use. The entitlement's `used_at` remains null.
10. The actual admin preview reports zero used benefits for the source referral, although the discount was used on the paid invoice.

Fresh result with the candidate:

```text
ACTUAL_ADAPTER_SQL_CURRENT [{"state":"absent","used_at":null}]
ADMIN_PREVIEW_USED 0
FAIL: expected used-benefit count 1, received 0
```

This is a persistent financial-record and admin-preview error. I did not establish an additional charge, a duplicate discount, or a hosted occurrence.

The control uses the existing SDK transport fixture, `stripeReferrals`, `applyReferral`, `recordReferralInvoice`, `reconcileReferralInvoice`, and the actual command SQL in PGlite. The transport fixture changes the invoice to paid immediately before the actual adapter withdrawal. No adapter result is fabricated. The actual adapter returns undefined.

With only the command function restored to its original definition, the same control passes. The later receipt changes the operation to used and the admin preview reports one used benefit. This establishes the regression caused by the new terminal guard. The original migration file is unchanged from the rejected candidate.

Minimum fix: Keep a paid invoice with the reserved coupon in an applied or committed state until its receipt records use. The adapter can report `committed` when its withdrawal read finds that paid invoice. Alternatively, reconcile its decisive paid snapshot before marking anything absent. Preserve the terminal guard for genuinely absent operations, because removing it restores the late-zero defect.

An in-memory change of the adapter's paid return from undefined to `"committed"` makes the complete race control pass with the candidate SQL. This was a proposed-fix control only. No product file was changed. Add a permanent public-interface plus actual-SQL regression for this sequence.

## Migration, access, locks, and privacy

The additive file contains one `create or replace function public.referral_command(jsonb)`. It does not change tables, indexes, policies, triggers, roles, or grants. Its function signature, security-definer setting, and empty search path match the original.

A fresh local catalog comparison before and after replacement found the same table RLS flags, relation ACLs, policies, function OIDs, owners, function ACLs, security settings, and referral trigger definitions. Effective local controls then established:

- Eight authenticated nonadmin table reads return zero rows through RLS.
- Eight authenticated table inserts fail with SQLSTATE 42501.
- Eight anonymous table reads fail with SQLSTATE 42501.
- Authenticated and anonymous command calls fail with SQLSTATE 42501.
- A synthetic admin predicate permits the positive account read.
- The service-role command call succeeds.

These controls use synthetic local roles and the fixture's admin predicate. They do not establish hosted Auth, inherited-role behavior, or platform grants.

Source comparison preserves the program advisory lock and the ordered family-row locks before ledger mutation. The current scope checks reject completion with another parent or a different customer. Both rejection controls passed against the actual SQL.

The previous recipient, token, and current-owner admission checks remain. Correction still refuses sending or unknown email claims. Started rewards retain their child cohorts. Family deletion still removes code, customer/contact links, private email copies, and correction detail while preserving the required financial receipt. The rollback probe checks wrong recipient, wrong token, in-flight correction, used-benefit preservation, reordered revocation, child deletion, and source-family deletion.

## Terminal states and recovery

| Control | Fresh result | Limit |
| --- | --- | --- |
| Unknown creation with no current subscription | PASS. The operation stays reserved. The key, price, and family hold remain. | Synthetic provider absence. No live timeout. |
| Provider write accepted, response lost | PASS. Recovery keeps one operation and reaches used after payment. | The provider boundary is synthetic. |
| Database completion accepted, response lost | PASS. Retry keeps one operation and one earned reward. | One local SQL backend. |
| Held draft, then clear | PASS. The existing operation can resume. | Synthetic coupon withdrawal and application. |
| Finalized revoked invoice returns committed | PASS. It stays applied until its later payment becomes used. | Provider finalization is supplied separately. |
| Used operation receives an older absent result | PASS. It remains used. | Actual local SQL. |
| Restart with uncertain old invoice | PASS. Admission stops until retirement is decisive. | Synthetic retirement outcome. |
| Restart after confirmed retirement | PASS. Only the retired entitlement is reused. A late old void receipt leaves the new reservation intact. | Actual local SQL, synthetic retirement. |
| Payment completes during revoked withdrawal | FAIL. See the confirmed P2 above. | Actual adapter and SQL, synthetic transport timing. |

## Fresh checks

The checkout has no `node_modules`. Test runs used the supplied existing dependency directory without linking or installing it:

`/Users/savargupta/.t3/worktrees/pagewise-landing-page/site-referral-program-f5ba58916067d1ed/node_modules`

Vitest ran programmatically with cache disabled, this checkout as its root, and `@` mapped to this checkout's `src`. Only package imports resolve to the dependency directory. The SQL settlement runner bundles `src/lib/referrals.ts` from the current checkout. PGlite uses the exact supplied module:

`/Users/savargupta/.t3/task-state/build-spec-181/201/sql/node_modules/@electric-sql/pglite/dist/index.js`

Completed checks:

- Four focused files passed, 56 tests: `referrals.test.ts`, `referral-stripe.test.ts`, `referral-start.test.ts`, and `referral-deletion.test.ts`.
- `scripts/referral-sql-local.mjs` passed both migrations and the expanded rollback probe. The transaction left zero synthetic parents and rewards.
- `scripts/referral-settlement-sql-local.mjs` passed all three controls.
- Those same three controls failed on the rejected core and original SQL, loaded in memory. No checkout files were replaced.
- The creation-key SDK test failed on the rejected adapter, loaded in memory.
- Four added public-function plus actual-SQL recovery controls passed. They cover the recovery and scope cases in the table above.
- The added actual-adapter plus actual-SQL payment-race control failed on the candidate. It passed with the previous command function. It also passed with the proposed adapter return change in memory.
- Catalog invariants and the effective local access controls passed.
- `git diff --check` passed. The original referral migration is unchanged. Pins and clean status were checked again before writing this report.

The additional controls were injected into the test loader or evaluated from memory. They are not new repository test files. Early loader/setup attempts were corrected before the counted control runs. Those setup failures are not product evidence.

To repeat the two committed SQL runners, use these commands from this review checkout:

```sh
PGLITE_MODULE=/Users/savargupta/.t3/task-state/build-spec-181/201/sql/node_modules/@electric-sql/pglite/dist/index.js node scripts/referral-sql-local.mjs
NODE_PATH=/Users/savargupta/.t3/worktrees/pagewise-landing-page/site-referral-program-f5ba58916067d1ed/node_modules PGLITE_MODULE=/Users/savargupta/.t3/task-state/build-spec-181/201/sql/node_modules/@electric-sql/pglite/dist/index.js node scripts/referral-settlement-sql-local.mjs
```

## Supplied evidence and proof limits

The controller supplied these completed results. I did not repeat them:

- Hosted migrations `20261114013255_family_referrals` and `20261114015329_referral_settlement`.
- The expanded hosted rollback probe and official type/check generation.
- Hosted parent/anonymous access denials and the admin positive control.
- Twelve Stripe test-mode adapter checks, including initial versus renewal creation keys.
- Parent/admin Aside checks and synthetic-account cleanup.
- The final full gate: 692 files, 21,029 passing tests, one skipped, ESLint, and build. I read the committed log at `.design/evidence/referrals/final-gate.log`. Its test counts and completed build agree with the supplied result. I did not rerun the full gate.

The fresh checks establish local source, SDK request, and actual local SQL behavior. PGlite uses one backend with synthetic platform tables and family fences. It does not prove hosted lock timing or two-session races. The recorded ordering is a deterministic transport-boundary control, not a measured Stripe race.

The separate hosted, provider, and browser results do not establish one combined hosted billing journey. Live webhook events and production key permissions remain unverified because the supplied Vercel response redacted the key. No live Stripe configuration, application deployment, push, or PR is established here.

No full suite, paid call, browser session, environment or secret read, hosted/provider write, commit, push, or PR comment was performed. No merge or release is approved.

REFERRAL_SETTLEMENT_RECHECK_DONE
