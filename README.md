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
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project key. Without it, events log to the console in dev only. |
| `NEXT_PUBLIC_POSTHOG_INGEST` | PostHog ingest host (default `https://us.i.posthog.com`; EU: `https://eu.i.posthog.com`). |
| `NEXT_PUBLIC_SITE_URL` | Public URL, used for share-card links. |
| `STRIPE_DEPOSIT_LINK` | Stripe Payment Link for the BC refundable deposit (server only). |

Funnel events: `cta_click`, `form_start`, `plan_selected`, `details_done`, `waitlist_join`, `checkout_start`, `reserve_success`, `deposit_redirect`, `deposit_paid` (plus `$pageview`).

## Notes

- Signup path (D-053): the BC curriculum goes to a Stripe Payment Link for a refundable deposit; every other curriculum joins the waitlist. Both are saved to Supabase first.
- Brand name and prices live in `src/lib/site.ts`. Canadian postal-code validation lives in `src/lib/signup.ts`.
- Fonts: Zodiak and Switzer are self-hosted under the ITF Free Font License (`src/fonts/FFL-Fontshare.txt`). The licence forbids redistributing the font files, so keep this repository private.
- Photos: Unsplash licence only; see `.design/assets/stock/CREDITS.md`. The hero lineup in draft A is AI-generated.
