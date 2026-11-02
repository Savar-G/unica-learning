# Workbook email review

Candidate: site/workbook-delivery-emails against origin/main ddc5d826cfe1bb7e66e0a40f34a5a2b8c8f0b17a.

## Independent source review

Codex gpt-6.1-sol at high reasoning effort found one P2 defect, WEMAIL-1. A family awaiting deletion could occupy a limited welcome batch and abort that batch before valid families were processed.

Root correction: filter out parents with deletion_requested_at before each candidate and queue limit. Count the same eligible queue. Catch each queued welcome's error separately. This also covers deletion starting after queue selection.

The two new public-worker regressions failed with family_unavailable before the correction. They passed after it. Failure output and current test output are in ../evidence/workbook-emails/. This correction was checked by the root agent, not independently reviewed again.

## Evidence boundaries

- Full local suite: 181 files and 9,129 tests passed.
- Focused email tests: 33 tests passed, including closed Checkout tab, late Stripe response, duplicate sends, unknown outcome, refusal retry, ownership, route authorization and deletion queue progress. These use fake provider and store responses.
- Hosted SQL probe: supabase/tests/workbook_emails.sql passed with synthetic family rows rolled back. It checked queue creation, old-family opt-out, parent/visitor access denial, duplicate claims, refusal retry, claim tokens, unknown outcomes, required tracking, hand delivery, separate workbook numbers, welcome ordering and family deletion. It made no provider calls.
- Hosted Data API accepted the eligible-card query with the parent deletion filter, HTTP 200 and zero requested rows. The actual runWorkbookWelcomes module ran in dry mode against the hosted project and reported pending 0, checked 0 and sent 0.
- Hosted cron configuration has a compatible destination, a secret and an active workbook job. No secret values were recorded. The endpoint becomes available when the code is deployed.
- Aside rendered the actual client component in a temporary local fixture inside the existing AdminFrame. Mail required tracking. Hand delivery removed tracking fields. Editing the delivery method cleared the old preview. Welcome and dispatch previews matched the templates. An uncertain workbook disabled the welcome and dispatch controls even with hand delivery selected. A 390 px viewport had no horizontal page overflow. The temporary route was removed.
- Source lint initially rejected Date.now during rendering. The read moved to the data loader and is passed as a stable prop.
- A build encountered stale generated types for the removed QA route. The worktree's generated .next/dev cache was removed.

No actual customer emails were sent. No real provider delivery or inbox receipt was verified. Browser QA used fixtures, not a live customer or a hosted admin session.

## Visual review

Independence: root self-review of the rendered component. Product weights follow the design skill rubric.

| Dimension | Score | Weight | Evidence |
|---|---:|---:|---|
| Task fit | 8 | 20 | Delivery method, tracking and numbered workbooks. |
| Content and hierarchy | 8 | 15 | Recipient and preview appear before send. Billing remains explicit. |
| System coherence | 8 | 15 | Existing admin classes, details, buttons and email brand. |
| Interaction and states | 8 | 15 | Required tracking, preview reset, unknown disabled and persisted history. |
| Accessibility and responsiveness | 7 | 15 | Native labels, status text, focus styles and 390 px fixture. No assistive-technology test. |
| Visual expression | 7 | 5 | Existing admin style. |
| Craft | 7 | 10 | Consistent form alignment and readable wrapped message text. |
| Evidence and fidelity | 7 | 5 | Real component, hosted schema probes and local sender seam. No inbox proof. |

Weighted score: 76.5/100. Recommendation: ready for code review after final lint and production build pass.

Final gate: ESLint over src and the production build passed after the timestamp correction and removal of stale development types. The temporary route is absent from the production build.

Stored text logs omit trailing whitespace. The original failure log remains at /tmp/unica-workbook-email-deletion-red.log in the development workspace.

## Home delivery correction

The free month starts only after an admin confirms that the first workbook reached the family's home. The button, confirmation, API, Stripe metadata and current customer text use that rule. Card setup and delivery emails do not start a subscription. The old bodyless shipment request is rejected.

An independent read-only review of this correction against 5029b6b80340f907483fe287a9dc745c9d316d66 returned PASS with no P1 or P2 findings. Its fresh checks used fake dependencies. Nine invalid confirmations made no provider calls. Twelve rejected API requests made no Stripe calls. A confirmed delivery produced a 30-day trial with stable retry parameters and delivery metadata. Cancel made no request. Confirm sent deliveryConfirmed true. The reviewer did not repeat the full test suite or test hosted billing.

The root agent's focused run passed 122 tests in nine files. Two guard assertions failed before the correction. Aside showed the actual button and home-delivery confirmation in a temporary local fixture. Cancel produced zero requests. The fixture was removed. The screenshot is ../evidence/home-delivery/admin-button.png. No customer billing request or email was sent during these checks.
