# Shipping address review

Source review: independent Codex gpt-6.1-sol at high reasoning effort. No concrete defects found.

Candidate: site/shipping-address against origin/main ddc5d826cfe1bb7e66e0a40f34a5a2b8c8f0b17a.

## Evidence

- Full test suite: 178 files and 9,098 tests passed.
- ESLint over src passed. Production build and TypeScript passed.
- Reviewer: 45 focused tests passed. The public request checks passed on both candidate setup paths and detected missing shipping parameters at the base.
- A real Stripe test-mode Checkout was created through the changed cardSetupUrl. Stripe accepted Canadian shipping collection and automatic customer shipping updates with setup mode.
- Aside rendered the full shipping form, Canadian provinces, optional address line 2, and the workbook-purpose text. Empty submission showed required address markers. Fictional full address input worked. Screenshots: ../evidence/shipping-address/desktop.png and ../evidence/shipping-address/mobile.png.
- Local development /privacy rendered the new shipping disclosure.

## Proof limits

The automated browser did not expand the payment selection, so no test Checkout completed. Address retrieval from the customer, persistence without a return visit, and visibility in the Stripe Dashboard remain unverified. No production payment, customer, or subscription was changed.

## Visual review

Independence: self-review for rendered output. The independent review covered source and local request checks. Product weights follow the design skill rubric.

| Dimension | Score | Weight | Evidence |
|---|---:|---:|---|
| Task fit | 8 | 20 | Shipping form precedes payment; account signup stays separate. |
| Content and hierarchy | 8 | 15 | Workbook shipping purpose appears immediately below the address. |
| System coherence | 8 | 15 | Existing hosted Checkout and report note classes. |
| Interaction and states | 6 | 15 | Required markers and address input observed; payment completion unverified. |
| Accessibility and responsiveness | 7 | 15 | Labeled controls in the accessibility tree; 390 px form fits. No full assistive-technology test. |
| Visual expression | 7 | 5 | Existing Checkout style. |
| Craft | 8 | 10 | Fields align and the disclosure wraps within the form. |
| Evidence and fidelity | 6 | 5 | Real test-mode form and request evidence; no completed session. |

Weighted score: 74/100.

Recommendation: source is ready for review. Complete a Stripe test submission and verify customer shipping before claiming end-to-end validation.

## Existing signup

Ask the parent for their shipping address before mailing the workbook. Save it in Shipping details on the matching Stripe customer. Do not ask them to add the card again. Do not infer the shipping address from billing details.
