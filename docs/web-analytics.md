# Web analytics (admin Traffic tab)

`/admin/traffic` shows how many people visit the site today, in the past 7 and 30 days and all time, where they come from, which pages they open and how far they get. It replaces paid Vercel Analytics as the team's way to read traffic. Two counts sit side by side, because they answer different questions.

## The two counts

| Count | Source | Who it sees | Unit |
|---|---|---|---|
| Visits | `public.site_hits`, our own cookieless counter | Every visitor to a public page, with no cookie and no consent | One browser tab, open to close. A person on two devices counts twice. |
| Accepted analytics | PostHog, read with HogQL | Only visitors who accepted the cookie banner | A person (PostHog `person_id`) across tabs and days |

The tab shows the share (accepted visitors / visits, past 30 days) once the cookieless counter is 30 days old, so a brand-new counter is not compared with PostHog's longer history. Compare trends, not the two totals.

## The cookieless counter

- Browser: `VisitTags` (`src/components/visit-tags.tsx`) calls `trackHit` (`src/lib/site-hits.ts`) on each page change. The tab's visit id is a random UUID in `sessionStorage` (`unica:hit`). The first page of a visit is the landing: only it sends the referrer host and the UTM tags.
- Server: `POST /api/hit` (`src/app/api/hit/route.ts`) answers 204 at once and writes after the response. It drops bots (`isLikelyBot`), posts that are not same-origin, bodies over 2 KB, and floods (3,000 views in 10 minutes). A failure only logs.
- Stored in `public.site_hits`: path, visit id, landing flag, referrer host, UTM source, medium and campaign, device class, browser family, country, region. Never an IP, a user agent, a cookie, a full referrer, a query string or a click ID. Country and region come from Vercel's `x-vercel-ip-country` and `x-vercel-ip-country-region` headers.
- Not counted (`countablePath`): `/admin`, `/tutor`, `/account`, `/api`, `/auth`, `/sign-in`, `/family-deleted`, `/unsubscribe`, `/f/<code>`, and any address that may hold a QR token. The server checks the same rule.
- A team member who browses the public site is counted. There is no way to tell them apart without an identity.
- Days are Pacific days. British Columbia stays on UTC-7 all year since 2026-03-08, so `public.pacific_day` and `pacific_day_start` use the fixed offset from that date (the same dated override as `src/lib/family-time.ts`).
- The tab reads it through the admin-only function `admin_site_traffic(p_days, p_with_tests)`, which answers one jsonb with every number. `p_days`: 1 (today), 7, 30, or null (all time). The funnel and the campaign signups count families, and leave out test and team families unless "Show test families" is on.

## PostHog

`src/lib/posthog-traffic.ts` runs eight HogQL queries in parallel through `POST <host>/api/projects/<project>/query/`, with a read-only personal API key. A query that fails leaves its section empty and the tab says so; the cookieless numbers still show. The admin area never sends events to PostHog, so nothing here counts the team's own pages.

| Variable | Meaning |
|---|---|
| `POSTHOG_PERSONAL_API_KEY` | Required. A PostHog personal API key with read access to the project (query read). Server only. Without it the PostHog section says it is not connected. |
| `POSTHOG_PROJECT_ID` | Optional. Default `650128` (Unica Learning). |
| `POSTHOG_HOST` | Optional. Default `https://us.posthog.com`. |

Set the key in Vercel (Production) and in `.env.local`.

## Reading the tab

- "What is working": visits that landed with UTM tags, and the families that signed up with the same source, medium and campaign (`parents.source`). Signups per 100 visits is a rough rate, not a proof: a signup can follow a visit from another device or an earlier range.
- "How far they get": visits, then tabs that opened `/start`, then families: accounts, tests started, tests finished. A step can pass the one above it for the same reason.
- Browser "Instagram app" and "Facebook app": a link opened inside the app (ads open there).

## Privacy

The privacy page (`/privacy`) describes this count in plain words. Change both together.
