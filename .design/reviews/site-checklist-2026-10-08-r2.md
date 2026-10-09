# Review - website checklist - 8 October 2026

Historical review. The public draft notices and missing contact described below were corrected after the user's feedback. Current text and evidence: `.design/reviews/plain-language-2026-10-08-r2.md`.

Independence: self-review for the rendered design. Two fresh reviewers separately checked the source. They did not run the browser or build checks.

Technical gates: PASS locally. Production ship gate: needs decision.

Evidence inspected: `DESIGN.md`, the design rubric, the changed source, and `.design/evidence/checklist/`. Screens inspected include the mobile home and consent banner, desktop/mobile privacy pages, mobile 404 and desktop form failure. The form failure notice spacing was corrected after inspection and the form browser check was repeated.

| Dimension | Score | Marketing weight | Evidence |
|---|---:|---:|---|
| Task fit | 8 | 15 | Above-fold primary CTA at all three widths; mobile CTA opens the existing booking dialog. |
| Content and hierarchy | 7 | 20 | Single heading per supporting page; prominent policy draft notices; real business details remain missing. |
| System coherence | 8 | 10 | Existing warm tokens, Geist type, mono labels, orange marker and button components. |
| Interaction and states | 8 | 5 | Busy state, immediate duplicate submit guard, field errors, server failure/retry, waitlist, neutral receipt and cancelled card recovery. |
| Accessibility/responsiveness | 8 | 10 | No overflow at 375/768/1440 px; invalid-field focus, dialog keyboard check, cookie-settings focus return, reduced motion, text error cues and decorative alt handling. |
| Visual expression | 8 | 20 | Supporting pages and cookie controls use the established Pagewise appearance. The hero remains the approved existing composition. |
| Craft | 8 | 15 | Readable text column, aligned support header, full-width mobile CTA, equal consent buttons and corrected form notice padding. |
| Evidence/fidelity | 7 | 5 | Source, local production responses and rendered screenshots agree. Live Stripe and hosted analytics are not verified. |

Weighted score: 77.5/100. These are the main agent's scores, not the independent reviewers' scores.

## Gates and limits

- Lint and production build pass. Lint reports one existing unused-import warning.
- Required local routes render. A missing route returns 404, including in the production build.
- The Vercel preview passed nine HTTP checks at code commit `dbf18d2`. Hosted pages, noindex, robots, sitemap and assets are verified. Hosted browser interaction, live Stripe and PostHog ingestion remain unverified.
- The consent tests check rejection during import and reject/accept races. The SDK browser test includes a positive event after acceptance and no added event after rejection.
- Form browser checks intercept responses. They verify frontend state, not the live database, notification email or Stripe handoff.
- New text uses the existing dark ink on white or pale backgrounds. Controls retain visible focus and text error messages. A full assistive-technology and text-scaling audit was not performed.
- No new performance claims, testimonials or affiliations were added.
- Policy drafts remain visible and noindex. They are not final legal policies.

## Independent source review

Round one found a missing card-success event and smaller issues with stale receipts, busy announcements, error descriptions and unused banner sizing. Those findings were corrected.

Round two found no blockers and confirmed those corrections. Its remaining low findings were a card-success event repeated on reload, an unthrottled Stripe verification lookup and stale documentation. Session-storage event deduplication and the documentation were then corrected. The lookup remains unthrottled and returns no parent or payment details. Live Stripe key access remains unverified.

## Comparison

The existing hero, plans and curriculum rules remain. Supporting routes and recovery states are added. Analytics now requires consent and excludes parent contact information and child grade. Mobile assessment access remains available after the cookie choice and is hidden while the dialog is open.

Weakest limiting dimension: content and hierarchy. The public business identity, contact address and final policy procedures need the owner.

Recommendation: needs decision for policy completion and production merge. The code is ready for pull-request review.
