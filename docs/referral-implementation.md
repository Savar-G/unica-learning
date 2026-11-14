# Referral implementation

## Boundaries

The public parent contract is `src/lib/referral-contract.ts`. The optional `benefitApplied` flag preserves a confirmed incoming benefit after deletion removes the source family's code. No parent result contains the other family's identity, child IDs, invoice IDs or payment IDs.

`referrals.ts` uses the store and provider interfaces. `referrals-memory.ts` is the local store. The Supabase adapter uses the service-only `referral_command(jsonb)` RPC. All admissions take the program advisory lock, then live family rows in UUID order, before a ledger row. RLS permits operational reads only to admins. Parents have no direct table access.

Accounts retain lifetime first-payment history separately from the first actual qualifying subscription payment. A manual paid mark cannot earn a reward. A later actual successful payment can qualify an attribution confirmed before payment. Each reward has a fixed cohort after its first reservation. Child entitlements own their own queue. An invoice can have one operation. A start key also records a no-discount choice, so a later reward cannot change an uncertain creation request. Reservations hold the existing family payment fence. A timeout does not release a hold. Current provider evidence or a definitive refusal settles it.

A child deletion retains its known customer for history reads. The family deletion worker records any missed qualifying payment after payment settlement and immediately before Auth removal. A failed history read stops Auth removal. A source family deletion removes its parent/code/contact links. It retains only the financial receipt needed to check another family's unused reward. Recovery checks that receipt without requiring the deleted family's identity. Private email copies and correction reasons are removed for the deleted family.

An admin preview freezes the attribution and reward/cohort state. The correction checks that revision again and records actor, reason and time. A reward that has started keeps its cohort and existing benefits. An unstarted earned reward moves to the correct family. A post-payment correction can create the one missing earned reward. It creates no second incoming benefit and no second reward for the same referral. Paid invoices stay unchanged. Notification claims are not reset during a transfer.

## Provider requests

Installed SDK: Stripe 23.0.0. Its default API version is `2026-09-30.endive`. The implementation uses the installed Invoice parent, Discount source and Invoice Payment interfaces.

The shared family trial and each child's frozen existing price remain in the existing plan-start module. A trial subscription receives no referral coupon. A paid initial start or Restart includes the reserved coupon in `subscriptions.create`, before payment. The frozen plan-start key is also the Stripe idempotency key.

Coupon ID: `unica-referral-half-v1`. The adapter creates or reads this fixed ID. It validates 50 percent, duration `once`, no expiry, no redemption cap, and only product `unica_math`. It does not replace an unrelated customer, subscription, item or invoice discount. Separate invoice reservations use the same validated coupon without stacking rewards.

Provider list reads consume every page. A repeated cursor, missing continuation flag, page limit or provider error fails the read. Eligibility also scans the complete customer list for the family's `parent_id` metadata, so a removed child's retained provider customer is included. Known customer IDs remain in the ledger. An unreadable history does not become an empty history.

Qualification requires a current paid, nonzero monthly program subscription invoice and a current successful captured card charge linked through Invoice Payments. Manual payment records, an out-of-band mark with no actual charge, trials, zero invoices, failed attempts and wrong mode cannot qualify. Existing paid history prevents a second incoming benefit. Refund and dispute reads use current charges and disputes. Read orders and a permanent revoke state prevent reordered events from restoring a revoked reward. The qualifying receipt is read again before an earned benefit is dispatched.

For a draft invoice, the discount is attached to that invoice. A held or revoked benefit is removed while preserving other discounts. Finalization commits the discount to that invoice. Stripe does not permit its amount to change. Revocation keeps that committed discount and the existing monthly receivable. It never voids the monthly charge. An open dispute stops automatic collection. A clear result or revocation restores only the saved automatic-collection setting. The operation stays applied until payment or confirmed retirement, so a payment replay and a later Restart still reconcile it. A paid invoice is left unchanged. A stopped subscription's old unpaid referral invoice is deleted if still draft, or voided if finalized, before its unused entitlement can fund a paid Restart. A race with payment leaves the hold for reconciliation.

Provider limits remain explicit:

- `auto_advance=false` stops automatic collection. It cannot prevent a Stripe operator or a direct provider payment from paying an already finalized invoice. Do not manually collect an invoice with `metadata.referral_hold` set. The application starts no such collection.
- A missed draft-invoice event discovered only after a full-price payment cannot be repaired by changing that paid invoice. Its unused entitlement remains for a later renewal. The webhook and reminder recovery reduce this window. Stripe test-mode proof must measure it.
- An uncertain subscription creation with no current matching subscription is still unknown. Age and list absence do not release it. The existing team resolution for plan starts remains necessary when the provider never supplies a decisive result.
- Completely removed external provider history cannot be reconstructed from a partial list. Provider permissions, retained customer metadata, complete pagination and historic-account controls require hosted/test-mode verification.

## Webhook configuration

Keep all existing plan event subscriptions. Add these exact events to the existing signed endpoint `/api/stripe-webhook`:

```
invoice.created
invoice.updated
invoice.finalized
invoice.paid
invoice.payment_succeeded
invoice.payment_failed
invoice.voided
invoice.marked_uncollectible
charge.refunded
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
charge.dispute.funds_reinstated
charge.dispute.funds_withdrawn
```

The signature is checked before referral, plan or card work. A retryable referral failure returns 500. Existing plan/card work still runs for a shared event. Referral work has a 40-second abort signal. Reminder recovery has an independent bounded turn and shares the existing paced email transport. Candidate attempt times prevent one failed customer or reservation from taking every turn. Missed-event reads include customers whose first event never created a local referral account. Known qualification receipts also remain recoverable after source-family deletion.

The existing restricted key needs these resource permissions in addition to its current setup/card/plan permissions:

| Resource | Permission | Requests |
| --- | --- | --- |
| Customers | `customer_read` | list, retrieve, inherited discounts, family history |
| Subscriptions | `subscription_write` | list/retrieve and existing immediate creation with discounts |
| Coupons | `coupon_write` | retrieve/create the fixed validated coupon |
| Invoices, including Invoice Payments | `invoice_write` | list/retrieve/lines/payments; update discounts and collection; delete draft; void unpaid |
| Prices | `price_read` | validate line product and monthly interval |
| Products | existing read/write permission | existing plan product creation/read |
| Payment Intents | `payment_intent_read` | current succeeded payment and latest charge |
| Charges | `charge_read` | current captured amount, refunds and payment ownership |
| Disputes | `dispute_read` | current open/won/lost state |

Write includes read for that resource. The code derives mode from `sk_live_`, `sk_test_`, `rk_live_` or `rk_test_`. `STRIPE_REFERRAL_MODE=live|test` can specify a verified mode for another key format. It must match every current provider object. No new secret is required. Keep `STRIPE_WEBHOOK_SECRET` and the existing email settings.

Official sources: [invoice updates](https://docs.stripe.com/api/invoices/update), [subscription invoice timing](https://docs.stripe.com/billing/invoices/subscription), [coupons](https://docs.stripe.com/billing/subscriptions/coupons), [restricted permissions](https://docs.stripe.com/keys/permissions-reference.md).

## Local SQL harness

The local runner uses an in-memory PostgreSQL engine. Its base tables and family fences are synthetic. To repeat the local check in an isolated checkout:

```sh
npm install --prefix .referral-tools --no-save --package-lock=false @electric-sql/pglite
node scripts/referral-sql-local.mjs
```

`PGLITE_MODULE` can point to another installed PGlite module. The temporary installation was removed after the implementation check. It is not a project dependency.

## Parent release work

Apply `supabase/migrations/20261113234609_family_referrals.sql` through the approved migration path. First confirm that its version is unique against the latest hosted history. Run `supabase/tests/referrals_rollback.sql` on the hosted schema. It uses synthetic rows in a rolled-back transaction. Regenerate `database.types.ts` and `database.checks.ts`. No generated file was edited by the implementation worker.

Then verify the restricted key and event subscriptions in Stripe test mode. Test actual sibling prices and lower historical offers, the trial, immediate paid start/Restart, failed payment, refund/dispute ordering, accepted-write/response loss, a missed webhook, stopped old invoices, and the finalization limits above. Check parent/admin rendering and keyboard/mobile behavior. Run the final full test/lint/build gate and independent review. This local implementation does not establish hosted SQL, Stripe, browser or release proof.
