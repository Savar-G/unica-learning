# Pagewise landing page (working name)

Landing page for personalized, mailed math and reading workbooks (ages 6-12, grades 1-7, delivery across Canada).
Design truth: `DESIGN.md`. History: `.design/decisions.md`. Mockups: `.design/experiments/` (option A is parked in `drafts/`).

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm run start
```

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project key. Analytics loads only after the visitor accepts it. |
| `NEXT_PUBLIC_POSTHOG_INGEST` | PostHog ingest host (default `https://us.i.posthog.com`; EU: `https://eu.i.posthog.com`). |
| `NEXT_PUBLIC_SITE_URL` | Public URL, used for share-card links. |
| `NEXT_PUBLIC_ALLOW_INDEX` | Set to `true` only when the site can appear in search. Vercel preview deployments remain noindex. |
| `STRIPE_SECRET_KEY` | Stripe key (server only) for saving BC parents' cards. |

Funnel events: `cta_click`, `form_start`, `plan_selected`, `details_done`, `waitlist_join`, `checkout_start`, `reserve_success`, `card_redirect`, `card_saved`, `card_cancelled`, and `signup_save_failed` (plus `$pageview`). Events before analytics consent are discarded. The form does not identify a parent in analytics.

## Supporting pages

- `/privacy` and `/terms` are visible drafts with noindex. Confirm the business contact, retention periods, request procedures, and cancellation and refund terms before making them final.
- `/thank-you` shows a reservation or waitlist receipt after a successful save. A direct visit does not confirm a booking. Stripe returns with a Checkout session ID; the server confirms a saved card only for a completed setup session with a successful SetupIntent and a matching Pagewise reference. This page never charges a card.
- A missing route returns the custom 404 page. `robots.txt` and `sitemap.xml` follow the indexing switch. The sitemap includes the home page only while the policy pages are drafts.
- Cookie settings in the footer allow a visitor to change the optional analytics choice. The mobile assessment button hides while the banner or booking dialog is open.

The screenshot checklist and open items are recorded in `.design/research/site-checklist-2026-10-08.md`.

## Notes

- Signup path (D-053): the BC curriculum adds a card on Stripe (nothing charged until the first workbook ships); every other curriculum joins the waitlist. Both are saved to Supabase first.
- Brand name and prices live in `src/lib/site.ts`. Canadian postal-code validation lives in `src/lib/signup.ts`.
- Fonts: Zodiak and Switzer are self-hosted under the ITF Free Font License (`src/fonts/FFL-Fontshare.txt`). The licence forbids redistributing the font files, so keep this repository private.
- Photos: Unsplash licence only; see `.design/assets/stock/CREDITS.md`. The hero lineup in draft A is AI-generated.
