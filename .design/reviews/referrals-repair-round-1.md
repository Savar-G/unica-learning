# Referral repair round 1

Machine: Savars-MacBook-Pro-5. Source before repairs: 451af98eac89b65e6490c5263e977401f066168d. This is a builder repair record, not independent approval.

| Finding | Repair | Evidence |
| --- | --- | --- |
| Zero-value immediate invoice strands the next benefit | Bind its initial invoice before releasing the claim. Return after release so replay cannot reactivate it. | New public-interface test failed on the original source and passed after repair. It covers replay and the next paid renewal. |
| Revocation voids the full unpaid monthly invoice | Keep an already finalized discount and its receivable. Restore only a saved collection setting. Keep the operation applied until payment or confirmed retirement. Remove editable draft discounts and unallocated benefits. | New SDK transport tests failed on the original source. Stripe test mode then confirmed that the finalized invoice remains open with the same amount due, and can be paid normally. |
| Signed-in share link loses its code | Preserve a valid code in the redirect to the referral page. Capture the code at that destination. Keep the ordinary redirect for invalid input. | The actual server-page test failed before repair and passed after it. Browser confirmation with an owned family remains pending. |
| Coupon validation rejects the coupon Stripe creates | Expand applies_to on both retrieve and create. Continue to validate the product restriction. | Real Stripe test mode exposed the missing default field. New fixture tests failed before repair and passed after it. The real provider check then passed. |

Stripe considers a once coupon used when an invoice finalizes. The repair preserves that committed invoice discount under the approved rule to keep discounts already used. It does not erase the monthly receivable or create an extra charge. The ledger still records actual payment separately. [Stripe coupon behavior](https://docs.stripe.com/billing/subscriptions/coupons).

## Evidence

- Eight focused files passed, 66 tests. Tests cover the domain, provider adapter, start, deletion, draft, parent card, parent API and signed-in redirect. The regression controls failed on the original implementation. This is local source proof, not hosted SQL concurrency proof.
- Ten checks passed through Stripe test mode: coupon validation, free trial, first-child 3999-cent payment, finalized receivable preservation, actual card payment, partial refund, full refund, immediate sibling 2999-cent payment, zero payment funded by credit, and the following full-price month. Test clocks and synthetic customers were removed. See `.design/evidence/referrals/stripe-test-mode.json`. This is adapter/provider proof, not a combined hosted-ledger journey.
- The local SQL migration and rollback probe passed with stub platform fences. Hosted migration and permissions remain pending.
- The real local parent API returned 401 with 33 response bytes for a signed-out read. A cross-origin write returned 403 with 30 bytes.
- Aside checked the actual home pricing section at 1440 px and 390 px. Scroll widths were 1425 px and 375 px. The desktop reveal elements reached opacity 1 with visibilityState visible. Cookie controls were dismissed before capture. Both owned tabs were closed. Screenshots: `.design/evidence/referrals/pricing-desktop.png` and `pricing-phone.png`. Parent and admin browser checks remain pending.
- Type generation succeeded. The type check still has 23 errors from missing generated referral schema entries. No other TypeScript error was reported in that run.

Independent settlement, hosted migration/types/checks, parent/admin browser proof, the final full gate and the production configuration checks remain pending. Nothing has shipped.
