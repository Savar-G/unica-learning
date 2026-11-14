# Family referrals

## Approved offer

A family shares its permanent generated referral code or link. A family that has never paid enters the code on Unica before its first payment. Its existing free month stays. It receives 50% off one paid monthly renewal for each enrolled child, including the sibling price. The server freezes the child list when this benefit starts. A later child joins a later earned reward, not this benefit.

The referred family's first successful nonzero subscription payment earns one reward for the referring family. A saved card, a trial, a zero-value invoice, a failed payment and a payment attempt do not earn it. Free and paying families can refer. A family can receive only one new-customer referral benefit.

Each earned reward gives 50% off one paid renewal for every child enrolled when that reward starts. Different child renewal dates are supported. At most one referral discount applies to a child renewal. Separate referrals fund separate renewals. Rewards and codes never expire and have no maximum. Each child's unused benefit waits through pause or cancellation. A paused child must not stop another child's reward queue.

An enrolled child has a program plan, including a free, paused or cancelled plan that can resume. An assessment-only child does not have an enrolled plan. A deleted child cannot receive a charge or discount. Deletion must not erase another child's reward or the family's first-payment history.

## Refunds and disputes

A full refund or lost dispute on the qualifying payment removes only unused benefits from that referral. Never increase a paid invoice or recover an already used discount. An open dispute holds unused benefits until the outcome is known. Partial refunds preserve the reward. Fetch current provider state before applying a refund or dispute event. Out-of-order events must not restore a revoked benefit.

A discount already fixed on a finalized invoice stays on that invoice. Keep the monthly amount still owed and its payment retries. Revoke unallocated benefits and remove editable draft discounts. Do not cancel an entire monthly invoice to reverse a referral discount.

## Parent experience

- The Account page shows the family's code, a copy-code action, a copy-link action, pending-referral count and earned/remaining-reward counts. It never names the other family or exposes its invoice, child or payment details.
- A referral field appears at the program choice, before the hosted card setup. It stays available after a card save and before the first payment. Invalid or unconfirmed codes do not show success. A typed but unapplied code is confirmed before leaving for card setup.
- A share link fills the code automatically. The parent can remove it. A share link never overwrites a confirmed referral. Codes are normalized without exposing account existence or private family data.
- Free and cancelled families can reach referral management without an open paid-plan gate. The child's desk cannot read or change referral data.
- The earned-reward email states the benefit and links to the parent's account. It goes through the existing send-once delivery module. It contains no other family's identity.
- The pricing section includes a short referral explanation. The FAQ has one referral entry. Do not add a new landing-page section. Keep the full rules on the terms page or a linked rules page.

## Operations and payment boundaries

An admin can correct attribution after payment. The correction records the actor and reason. It preserves paid invoices and already used benefits. A correction must not award the same referral twice or apply a second new-customer month. Any proposed future correction is visible before it writes.

The database owns code identity, attribution, first-payment receipts, reward order, each reward's enrolled child list, invoice claims and email claims. Unique keys prevent duplicate rewards, duplicate discounts and duplicate sends. Family locks serialize code admission against payment recording. Use the existing deletion fences and lock order.

Stripe owns invoices, payments, coupons and applied discounts. Validate coupon amount, duration and product. Never replace unrelated discounts. A trial invoice cannot use up a referral benefit. An immediate paid initial start or Restart must receive the discount before payment, not after it. A timeout leaves a durable uncertain operation for recovery. Never release a possibly applied claim on elapsed time alone.

The webhook reads the current invoice or payment state. It verifies the signature before all work. It processes both relevant plan events and referral events. Retryable failures return a non-2xx result. The existing reminder job performs bounded recovery of pending referral work and emails. It must recover missed events without reading a partial provider list as complete. Provider mode and customer ownership must match.

The live webhook endpoint needs the exact new event subscriptions and the restricted Stripe key needs the corresponding read/write permissions. Verify both before release. Keep local mock proof, hosted SQL proof and Stripe test-mode proof separate. No production payment or customer email belongs in a test.

## Verification cases

1. Trial zero invoice, failed payment and repeated paid event versus one first successful nonzero payment.
2. Two sibling payments and duplicate webhooks concurrently produce one family reward and one notification claim.
3. The existing free window and 7999/5999-cent prices remain. The discount applies to the existing price, including lower old offers.
4. Two referrals fund two separate renewals. Incoming and earned benefits cannot combine into 100% off.
5. Paused child, active sibling, changed renewal dates, cancellation, paid Restart, later child and child deletion.
6. Full and partial refund, open/won/lost dispute, reordered events and partially used family rewards.
7. Self-referral, another family's data, desk access, deletion, paid family trying to redeem and an unreadable billing history.
8. Provider write accepted then response lost, database completion lost, webhook lost and recovery. Neither duplicate discount nor duplicate send is permitted.
9. Admin correction before and after reward use, with audit and no change to paid invoices.
10. Code/link capture through signup and sign-in, manual override, invalid code, blocked storage, failed copy, mobile layout and keyboard operation.

## Release

The implementation is not released by this document. Apply and verify the additive migration before application deployment. Regenerate database types and checks. Complete the required tests, lint, build, browser checks and independent review. Savar owns the production merge.

## Implementation handoff

REFERRAL_IMPLEMENTATION_DONE

Implementation and focused checks are complete. Applied migration versions, verification evidence and release limits are recorded in `docs/referral-implementation.md`. Production merge remains with Savar.
