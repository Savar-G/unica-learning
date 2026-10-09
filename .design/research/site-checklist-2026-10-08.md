# Website checklist - 8 October 2026

The supplied screenshot shows 19 items. Its heading says 20, but item 20 is not visible.
This work uses the existing Pagewise design. It preserves Canada-wide delivery, BC card setup with no charge, and the waitlist for other curricula.

| Item | Result | Implementation or evidence |
|---|---|---|
| 1. Custom 404 | Complete | `src/app/not-found.tsx`; missing routes return HTTP 404 in development and the local production build. |
| 2. CTA above the fold | Verified existing | Home primary CTA is visible at 375, 768 and 1440 px. |
| 3. Meta title per page | Complete | `pageMetadata`; distinct home, privacy, terms, thank-you and 404 titles. |
| 4. Meta description per page | Complete | Distinct descriptions on those five page types. |
| 5. Open Graph image | Verified existing | Existing Pagewise 1200 x 630 image; HTTP 200, PNG, 53,308 bytes. Page metadata uses the site URL. |
| 6. Favicon set | Complete | SVG, 16/32/48 px ICO and 180 px Apple icon. |
| 7. robots.txt | Complete | Launch indexing is explicit. Preview builds always block indexing. |
| 8. sitemap.xml | Complete | Empty while indexing is off. Only home is listed when indexing is on. Draft policies and receipts are excluded. |
| 9. Alt text | Complete | All image elements have alt attributes. Decorative images have empty alt and an aria-hidden ancestor. |
| 10. Mobile breakpoints | Verified and extended | Five page types at 375, 768 and 1440 px have no horizontal overflow. |
| 11. Sticky mobile CTA | Complete | Fixed below 700 px; hidden during the dialog or cookie banner; bottom space and safe area reserved. |
| 12. Loading states | Complete | Form save status, disabled controls, duplicate submission guard, and thank-you route loading state. |
| 13. Form error states | Complete | Inline errors, error summary, first-invalid focus, server failure and retry with preserved values. |
| 14. Thank-you page | Complete | Successful form responses route to a receipt. Fresh direct visits and expired receipts do not claim a booking. Stripe card success requires server verification. |
| 15. Privacy policy | Draft built | Visible draft notice and noindex. Content follows the current data flow. Business details and retention rules remain open. |
| 16. Terms | Draft built | Visible draft notice and noindex. Current price, free assessment and card setup are described. Business and service procedures remain open. |
| 17. Cookie banner | Complete | Equal accept/reject buttons; persistent preference; footer settings; keyboard focus recovery and cross-tab changes. |
| 18. Analytics installed | Complete locally | Existing PostHog integration now waits for consent. No contact details or child grade are sent. The SDK positive test uses an intercepted endpoint. Hosted ingestion remains unverified. |
| 19. Real contact address | Needs owner input | No approved public business email or postal address is available. No address was invented. |

## Validation and limits

- `npx eslint src` passes with one existing unused-import warning in `src/ds/blocks.tsx`.
- `npm run build` passes, including TypeScript.
- `node scripts/check-consent.mjs` passes 26 cases. It checks consent races, revocation, blocked storage, property filtering and URL scrubbing.
- `indexing-result.json` checks three configurations: prelaunch, production launch, and a preview with indexing requested. Preview indexing stays blocked. Policy drafts stay noindex in all three.
- `form-result.json` records 13 passing browser checks. Signup responses were intercepted. No real signup, email, card setup or payment was created.
- `responsive-result.json` records 15 route/viewport checks plus keyboard and reduced-motion checks.
- `consent-result.json` records five passing browser checks, including a real second tab and failed storage writes.
- `analytics-positive-result.json` records zero requests before consent, one after acceptance, and no added request after rejection. This checks the installed SDK with a fake key. It does not verify the live PostHog project.
- `production-routes.json` records local production HTTP status, response size and metadata for 11 routes/assets. This is not hosted deployment evidence.
- Two independent source review rounds found no remaining blockers. The final visual assessment is a self-review.

Card confirmation needs a Stripe key that can retrieve Checkout Sessions with an expanded SetupIntent. This was not tested against live Stripe. Confirmation reveals no parent or payment details. This route has no application rate limit; a valid-format session ID can cause a Stripe lookup.

## Owner inputs

1. Give the legal business name and the public support email and postal address.
2. Set the data retention periods and the process for privacy requests. Confirm provider data locations.
3. Confirm delivery timing, shipping costs, taxes, and cancellation/refund procedures.
4. Confirm the public domain and launch indexing when ready. Search indexing remains off by default.

The user owns the production merge and the policy approval.

## Sources consulted

- [Office of the Privacy Commissioner: meaningful consent](https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/collecting-personal-information-and-consent/consent/gl_omc_201805/) informed clear analytics choice. This work does not establish legal compliance.
- [PostHog privacy controls](https://posthog.com/docs/privacy) informed consent gating and capture restrictions.
- [Stripe: retrieve a Checkout Session](https://docs.stripe.com/api/checkout/sessions/retrieve) documents the verification lookup. Live key access remains unverified.
- Installed Next.js 16.3.8 guides in `node_modules/next/dist/docs/` supplied the current route, loading, metadata and error-boundary APIs.
