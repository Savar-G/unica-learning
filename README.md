# Unica Learning landing page

The Unica Learning site and product: a personalized math learning program with mailed workbooks (ages 5 to 14, Kindergarten to Grade 9).
Working conventions, services and every environment variable: `AGENTS.md` (the source of truth; this file is a short start). Design truth: `DESIGN.md`. History: `.design/decisions.md`. Mockups: `.design/experiments/` (option A is parked in `drafts/`).

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
| `NEXT_PUBLIC_SITE_URL` | Public URL: canonical links, the sitemap and structured data (`src/lib/metadata.ts`). |
| `NEXT_PUBLIC_ALLOW_INDEX` | Set to `true` only when the site can appear in search. Vercel preview deployments remain noindex. |
| `STRIPE_SECRET_KEY` | Stripe key (server only) for saved cards and plans. |

The full list is the "Environment variables" table in `AGENTS.md`. Analytics event names are in `src/lib/track.ts`. Events before analytics consent are discarded, and no event identifies a parent.

## Supporting pages

- `/privacy` and `/terms` use plain language and identify Unica Learning. Public support is `contact@unicalearning.com`, defined in `src/lib/contact.ts`. The first month is free (`TRIAL_DAYS` in `src/lib/site.ts`); it replaced the 30-day money-back guarantee. Both pages are indexable (D-319).
- `/thank-you` is where Stripe returns after a parent saves a card from the report. A direct visit confirms nothing. Stripe returns with a Checkout session ID; the server confirms a saved card only for a completed setup session with a successful SetupIntent and a matching Unica Learning reference. This page never charges a card.
- A missing route returns the custom 404 page. `robots.txt` and `sitemap.xml` follow the indexing switch. The sitemap (`src/app/sitemap.ts`) lists the marketing pages, the Resources guides and the Blog posts. Product and receipt pages stay noindex.
- Cookie settings in the footer allow a visitor to change the optional analytics choice. The mobile assessment button hides while the banner or a dialog is open.

The screenshot checklist and open items are recorded in `.design/research/site-checklist-2026-10-08.md`.

## Notes

- Signup path: a parent makes an account at `/start`, the child takes the free assessment, and the report offers the next step: a BC-curriculum family saves a card on Stripe (nothing is charged; the free month starts after the first workbook is delivered), and every other curriculum joins the waitlist.
- Brand name and prices live in `src/lib/site.ts`. Canadian postal-code validation lives in `src/lib/signup.ts`.
- Fonts: Zodiak and Switzer are self-hosted under the ITF Free Font License (`src/fonts/FFL-Fontshare.txt`). The licence forbids redistributing the font files, so keep this repository private.
- Photos: Unsplash licence only; see `.design/assets/stock/CREDITS.md`. The hero lineup in draft A is AI-generated.
