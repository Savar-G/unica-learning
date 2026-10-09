# Plain-language review - 8 October 2026

Route: `/design` direct, existing system. The user specified the text change. The page layout is retained. D-055 records the approved business name, email and guarantee start.

## Result

The customer pages have no draft labels or development notes. The cookie banner says optional cookies and explains the choice. Provider names appear only under “See the companies we use” in the privacy page, with plain explanations. Privacy, terms, booking review, receipt text and metadata use plain language. The guarantee starts on the day of the first payment throughout the site and payment-page message.

## Independent source reviews

Two fresh read-only Sonnet reviewers checked the source. They did not run the build or browser checks.

- Round 1 found that the payment disclosure omitted fields. It now lists all details sent to Stripe. Other corrections cover the cookie counts, guarantee start, payment label, child-work statement and current documentation.
- Round 2 found no blockers. Its remaining points were addressed: a lost payment link gives the support email instead of promising an unsent email; the general save error gives retry and support steps; privacy describes the purpose of photos if a parent sends them; policy dates say Updated.
- The photo-return service is not implemented by this landing-page PR. The policy does not invent a company for future photo processing.

## Runtime and visual checks

- `npx eslint src` passes with the existing unused `CSSProperties` warning in `src/ds/blocks.tsx`.
- `npm run build` passes, including TypeScript.
- `browser-result.json` contains 37 passing assertions. Home, privacy and terms were checked at 320, 375 and 1440 px. Checks require correct contact links, the business name, update dates, guarantee start, one heading, plain metadata and no horizontal overflow. The company disclosure opens at each width.
- Cookie checks cover full button labels at 320 px, the final visible panel, accept/reject states and Escape focus recovery.
- Form checks cover the review wording, an intercepted server failure and a lost payment link. Receipt checks cover reserved, waitlist, neutral and unconfirmed states.
- `hosted-result.json` records HTTP 200 and response sizes for home, privacy and terms on the protected Vercel preview at code commit `0f455bf`. The served text has the approved contact, plain privacy wording, first-payment guarantee and no draft notices. The Vercel check for that code commit passed. This does not prove hosted browser interaction or live service calls.
- The native T3 preview completed earlier page checks. It then reported that its automation host was unavailable and directed the agent to a shell browser. The final recorded checks use Playwright CLI.
- Screens inspected: `cookies-320.png`, `booking-review-375.png`, `privacy-375.png`, and `terms-1440.png`. Text and links fit the existing layout. The initial cookie capture caught its entrance animation; the final capture waits for the animation and checks opacity and the white background.

Copy and task fit pass. Layout and interaction remain consistent with the approved design. Visual independence: self-review. Source independence: two fresh reviewers.

## Limits

The server failure was intercepted. No real signup, notification, card or payment was created. These checks do not prove live Stripe lookup access or hosted PostHog ingestion. The earlier consent and indexing evidence remains in `.design/evidence/checklist/`. Current text evidence is in `.design/evidence/plain-language/`.

The user owns the production merge. This review does not certify legal compliance.

Plain-language consent guidance: [Office of the Privacy Commissioner](https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/collecting-personal-information-and-consent/consent/gl_omc_201805/).
