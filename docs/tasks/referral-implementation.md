# Referral implementation handoff

This is the historical delegate handoff at eeafa9d24fdc6811d90b99aafca078e87cbbfca5. Its pending items and check logs describe that pin. The controller's current hosted results, provider evidence and release limits are in [referral-implementation.md](../referral-implementation.md). Review repairs are in `.design/reviews/referrals-repair-round-1.md`, `referrals-repair-round-2.md`, `referrals-repair-round-3.md` and `referrals-final-repair.md`.

Status: local implementation and focused checks complete. REFERRAL_IMPLEMENTATION_DONE is set. Release remains pending.

Machine: Savars-MacBook-Pro-5.
Worktree: /Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-c9516e60-a7a2bce1247a4305.
Physical path: /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-c9516e60-a7a2bce1247a4305.
Branch: t3/c9516e60.
Parent base: 9214b1ca7f16c9e0ec08d912f8b697ce9e58f74b.
User-specified origin/main base: 5b09bcf91ea3328106e61d2d9c0aab6a147662d3.
The commit containing this handoff is the local implementation commit. No push or PR was made.

## Implemented

- Domain commands, memory store and public-interface money/concurrency controls.
- Additive service-only SQL ledger, atomic admissions, fixed cohorts, lifetime payment history, durable money reservations, current risk ordering, admin preview/audit and send-once claims.
- Supabase adapter and Stripe 23.0.0 adapter, including complete pagination, coupon validation, initial paid start/Restart, draft renewal discounts, stopped invoice retirement and bounded recovery.
- Parent API with authentication, desk guard, same-origin writes, bounded input, attempt limits, generic errors and no-store results.
- Code/link capture through signup/sign-in, manual entry, pending removal, confirmation before card setup, Account card and ungated referral route.
- Earned email through the existing send-once module and paced reminder transport. Private copies remain service/admin data. Unknown sends keep their claims.
- Source-family deletion records missed qualification before Auth removal. Child deletion retains billing history. Another family's earned reward survives source deletion.
- Inline home/pricing explanation, one FAQ entry and full terms. Sitemap dates changed for the home, pricing and terms pages.

## Verification

313 tests passed in the 21-file focused run. See `referral-focused-checks.txt`.
The last money-only run also passed 44 tests. See `referral-final-money-checks.txt`.
ESLint passed for all 44 touched TypeScript files. The last changed money files also passed. See `referral-lint-check.txt` and `referral-final-lint-check.txt`.
The local SQL migration and synthetic rolled-back probe passed. See `referral-sql-check.txt`.
`next typegen` passed. TypeScript reports exactly 23 errors from absent generated schema entries: 16 in `src/lib/referral-store.ts` and 7 in `src/app/(product)/admin/referrals/page.tsx`. See `referral-schema-typecheck.txt`. No generated file or query type override was used.

Proof by subsystem:

- Domain: concurrent sibling/duplicate receipts, disqualifying invoices, reward queues, cohorts, deletion, risk order, uncertain writes and notification claims passed through the public memory seam. This does not prove PostgreSQL concurrency.
- SQL: DDL, service grants, duplicate admissions, frozen parameters, payment holds, used benefits, preview/audit, child/family deletion and rollback passed locally. The platform tables/fences are stubs. This does not prove hosted triggers, grants or two-session behavior.
- Stripe: the real SDK over synthetic HTTP proved request parameters, discount preservation, current refunds/disputes, pagination refusal, invoice hold/void and cancelled draft retirement. It made no provider request.
- API/UI: unit checks proved authentication, desk exclusion, input bounds, same origin, no-store, draft persistence, failure text and copy failure. No browser or device proof was made.
- Existing plan/card/deletion/email checks: the selected cases passed. Their added referral dependencies use mocks, while the separate referral tests exercise the new seams. This is not one hosted integration test.

## Parent work

1. Read `docs/referral-implementation.md` for exact webhook subscriptions, restricted-key permission IDs and provider limits.
2. Confirm migration version uniqueness against the latest live history. Apply `supabase/migrations/20261113234609_family_referrals.sql`.
3. Run `supabase/tests/referrals_rollback.sql` on the hosted schema. It uses synthetic rows and ROLLBACK.
4. Regenerate `src/lib/database.types.ts` and `src/lib/database.checks.ts`. The five added referral state-list checks require the new generated constraints. Run the type and state-list checks after generation.
5. Complete Stripe test-mode proof. A finalized invoice cannot have its monetary discount changed. Automatic collection is held during a dispute; revocation voids the unpaid invoice. A missed draft first discovered after payment leaves its benefit for a later renewal. Do not manually collect a provider invoice with `metadata.referral_hold` set. Unknown creation is not released by age or list absence.
6. Inspect rendered parent/admin/pricing output and keyboard/mobile behavior. Complete independent review and the final full test/lint/build gate.

No hosted migration, live service write, real email, charge, browser check, deployment, merge, PC retry, account change, vault edit or additional agent was used.

## Touched files

- `docs/referral-implementation.md`
- `docs/referrals.md`
- `docs/tasks/referral-final-lint-check.txt`
- `docs/tasks/referral-final-money-checks.txt`
- `docs/tasks/referral-focused-checks.txt`
- `docs/tasks/referral-implementation.md`
- `docs/tasks/referral-lint-check.txt`
- `docs/tasks/referral-schema-typecheck.txt`
- `docs/tasks/referral-sql-check.txt`
- `scripts/referral-sql-local.mjs`
- `src/app/(product)/account/(dashboard)/page.tsx`
- `src/app/(product)/account/(dashboard)/referrals/page.tsx`
- `src/app/(product)/admin/referrals/page.tsx`
- `src/app/(site)/pricing/page.tsx`
- `src/app/(site)/terms/page.tsx`
- `src/app/api/account/referrals/route.test.ts`
- `src/app/api/account/referrals/route.ts`
- `src/app/api/admin/cards/[id]/start/route.ts`
- `src/app/api/admin/referrals/route.ts`
- `src/app/api/reminders/route.test.ts`
- `src/app/api/reminders/route.ts`
- `src/app/api/stripe-webhook/route.test.ts`
- `src/app/api/stripe-webhook/route.ts`
- `src/app/sitemap.ts`
- `src/components/admin-referrals.tsx`
- `src/components/parent-account-settings.tsx`
- `src/components/referral-card.test.ts`
- `src/components/referral-card.tsx`
- `src/components/report-next.tsx`
- `src/components/sections.tsx`
- `src/components/visit-tags.tsx`
- `src/lib/family-deletion-store.test.ts`
- `src/lib/family-deletion-store.ts`
- `src/lib/faq.ts`
- `src/lib/plan-controls-server.test.ts`
- `src/lib/plan-controls-server.ts`
- `src/lib/plan-start-deletion-recovery.test.ts`
- `src/lib/referral-contract.ts`
- `src/lib/referral-deletion.test.ts`
- `src/lib/referral-deletion.ts`
- `src/lib/referral-draft.test.ts`
- `src/lib/referral-draft.ts`
- `src/lib/referral-email.ts`
- `src/lib/referral-server.ts`
- `src/lib/referral-start.test.ts`
- `src/lib/referral-store.ts`
- `src/lib/referral-stripe.test.ts`
- `src/lib/referral-stripe.ts`
- `src/lib/referrals-memory.ts`
- `src/lib/referrals.test.ts`
- `src/lib/referrals.ts`
- `src/lib/state-lists.test.ts`
- `src/lib/stripe.ts`
- `src/lib/url-tokens.ts`
- `supabase/migrations/20261113234609_family_referrals.sql`
- `supabase/tests/referrals_rollback.sql`
