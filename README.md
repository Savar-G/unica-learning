# Pagewise landing page (working name)

Fake-door landing page for personalized, mailed math and reading workbooks (grades 3-5, Metro Vancouver).
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

Funnel events: `cta_click`, `form_start`, `plan_selected`, `details_done`, `outside_area`, `waitlist_join`, `checkout_start`, `reserve_success` (plus `$pageview`).

## Notes

- Checkout is not wired yet (D3/D8): "Continue to secure checkout" records the reservation in PostHog only.
- Brand name, prices and the delivery area live in `src/lib/site.ts`.
- Fonts: Zodiak and Switzer are self-hosted under the ITF Free Font License (`src/fonts/FFL-Fontshare.txt`). The licence forbids redistributing the font files, so keep this repository private.
- Photos: Unsplash licence only; see `.design/assets/stock/CREDITS.md`. The hero lineup in draft A is AI-generated.
