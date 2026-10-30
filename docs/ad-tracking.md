# Ad test tracking (Meta and Google Search)

A CAD 100 ad test (D-126): two Meta ads and two Google Search ads, each linking to the home page with UTM tags. The measure that decides the test is **cost per finished assessment**. A saved card is a customer.

| Channel | Tags on the ad's link |
|---|---|
| Meta, ad 1 | `utm_source=meta&utm_content=offer-first` (from 2026-10-24; was `photo-led`) |
| Meta, ad 2 | `utm_source=meta&utm_content=program-first` (from 2026-10-24; was `program-for-one`) |
| Google Search, 2 ads | `utm_source=google` and a `utm_content` per ad (`made-for-your-child-free`, `starts-where-free` from 2026-10-24; without `-free` before); Google adds `gclid` itself (auto-tagging) |

Meta adds `fbclid` to the link by itself.

## How it works

1. **Tags kept for the tab.** On every page, `VisitTags` (root layout, `src/components/visit-tags.tsx`) calls `keepVisit` (`src/lib/visit-source.ts`). The first page of the browser tab that has tags (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `ref`, `gclid`, `fbclid`) keeps them in sessionStorage (`unica:source`). First touch wins: a later tagged link in the same tab does not replace them. So a visitor who lands on `/our-story?utm_source=meta...`, reads the home page and then opens `/start` from a plain link still keeps the tags. The signup form sends them as the family's source (`parents.source`), also for a parent who signs up with Google. `StartLink` still carries the current page's tags to `/start`.
2. **Ad visit counter.** When those first tags show an ad visit (a `utm_source` other than `flyer`, or a `gclid` or `fbclid`), the browser makes one random visit ID for the tab (`crypto.randomUUID`, sessionStorage `unica:visit`) and posts it once to `/api/visit` (`src/app/api/visit/route.ts`) with the UTM tags and only whether a click ID was there. The route answers 204 at once and writes one row to `public.ad_visits` after the response. Only a browser's own post from this site counts (`Sec-Fetch-Site: same-origin`); link previews, crawlers, requests with no user agent and bodies over 2 KB are not counted. A visit ID already stored is not counted twice, and past 500 visits in 10 minutes (`RATE_MAX` in `src/lib/ad-visits.ts`) new visits are not counted, so a flood cannot fill the table. The row holds no IP, user agent, cookie or click ID value, so the count does not wait for cookie consent. The visit ID also goes into `parents.source` (key `visit_id`), so a visit joins to a family. Flyer scans are counted by `/f/<code>` (docs/flyer-tracking.md), not here.
3. **Signup steps.** A tab that has an ad visit ID also posts each signup step once to `/api/visit/step` (`src/app/api/visit/step/route.ts`; `markStep` in `src/lib/ad-visit-steps.ts`, sessionStorage `unica:steps`): `start_open` (`/start` opened, from `VisitTags`), `form_start` (the parent typed in the signup form), `google_start` (the parent chose "Continue with Google" on `/start`) and `code_sent` (the form was complete and the email code was sent). A finished signup needs no step: `parents.source->>'visit_id'` joins the family. The route follows the visit counter's rules (204 at once, the row after the response, same-origin only, no bots, a body of at most 1 KB, 2000 steps in 10 minutes at most) and writes one row per visit and step to `public.ad_visit_steps`: the visit ID, the step and the time. The foreign key refuses a step for a visit ID that `ad_visits` does not hold; a step that arrives before its visit row waits 2 seconds and tries once more. A tab without an ad visit ID sends nothing. Like the visit counter, this needs no cookie consent, so it covers every ad visitor; PostHog sees only the ones who accept optional cookies.
4. **Meta Pixel and the Google tag.** `src/lib/ad-tags.ts` loads them only after the visitor accepts optional cookies, at the same moment as PostHog (at once after Accept; after the page is idle for a returning visitor who accepted). Without their IDs nothing loads. Google gets its `config` call on load (which reads the `gclid` in the address) and then only conversions; ad personalization is off (consent mode `ad_personalization: denied`).
5. **Meta only on clean addresses.** Meta Pixel reads the page address itself, so it loads, sends a `PageView` and sends an event only when the address is clean (`metaCleanAddress`): the path is on an allowlist of fixed pages with no id (`/`, `/our-story`, `/compare`, `/rewards`, `/sample-report`, `/privacy`, `/terms`, `/resources`, `/resources/<guide>`, `/start`, `/account`, `/account/finish`), the query holds only `utm_*` or `fbclid` (not Google's `gclid`), and there is no hash beyond a short anchor. The referrer must be clean too (`metaCleanReferrer`): none, another site's bare origin, or a clean address here. Anywhere else Meta is paused and silent. Calls made before fbevents.js arrives go out only if the address is still clean when it does. Meta's own history tracking and automatic events are off, so every page view is ours.
6. **Conversions.** `track()` (`src/lib/track.ts`) also calls the ad tags, so call sites do not change:

   | track() event | Where it fires | Meta | Google Ads |
   |---|---|---|---|
   | `account_created` | `/start` (password) or `/account/finish` (Google; the OAuth code lands on `/auth/callback`, which redirects) | `Lead` | conversion, lead label |
   | `report_open` | `/account/report/<id>` | nothing (the address holds the report id) | conversion, report label |
   | `card_saved` | `/thank-you?session_id=...` | nothing (the address holds the Stripe session reference) | conversion, card label, value 79.99 CAD |

   So Meta gets `PageView` and `Lead`; it optimizes for landing page views and signups, and our database is the measure. `account_created` on a `/start` address with another query key (for example `?next=`) also stays off Meta. No email, name, child data, grade or id travels with any conversion. Google gets the page address and the referrer (`page_referrer`) with ids replaced and only the ad tags (`utm_*`, `gclid`) kept in the query, also on its first call when it loads; another site's referrer is cut to its origin.
7. **Never on a child's pages.** `adsBlockedPath` blocks the start screen the parent hands over (`/account/start/<child>`), the test (`/account/test/<child>`), the child's desk with its Forgot PIN screen and page QR codes (`/tutor` and everything under it, #301), and also `/admin`, `/api`, `/auth`, `/sign-in` and `/unsubscribe` (addresses that can hold a token). The scripts never load there. When they are already loaded from an earlier page of the same visit, they are paused on arrival (Meta `consent revoke`, Google consent denied), get no page view and no conversion, and resume on the next allowed page. A QR token in an address (`/tutor/p/<token>`) is replaced by `token` in every address sent to Google (`cleanAdAddress`, also as the next page's referrer) and in every PostHog URL and path field (`scrubEvent`), through `redactPathTokens` (`src/lib/url-tokens.ts`).

Pages whose address can hold an id or a token (`/thank-you`, `/account/*`, `/auth/*`, `/sign-in/*`, `/unsubscribe`) send `Referrer-Policy: strict-origin` (`next.config.ts`), so the next page, and any tag on it, sees only the site's origin as the referrer.

If the visitor turns optional cookies off later, the tags are paused and their cookies (`_fbp`, `_fbc`, `_gcl_*`) deleted; after a reload they do not load.

## Environment variables

All optional, all public (`NEXT_PUBLIC_`, so they are part of the browser bundle: set them before the build). A missing or malformed value turns that part off.

| Variable | What |
|---|---|
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta Pixel ID (digits). Unset: no Meta Pixel. |
| `NEXT_PUBLIC_GOOGLE_ADS_ID` | Google Ads tag ID, `AW-...`. Unset: no Google tag. |
| `NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL` | Conversion label for `account_created`. |
| `NEXT_PUBLIC_GOOGLE_ADS_REPORT_LABEL` | Conversion label for `report_open`. |
| `NEXT_PUBLIC_GOOGLE_ADS_CARD_LABEL` | Conversion label for `card_saved`. |

The visit counter needs no new variable: it writes with `SUPABASE_SECRET_KEY`.

## Reading the result

Our own data decides the test, not the ad platforms: they see only visitors who accepted optional cookies, and a visitor who accepts on a later page (the click ID no longer in the address) may not be matched to the ad.

- **Finished assessments per channel and ad:** families whose `parents.source` has `utm_source=meta` or `google`, split by `utm_content`, joined to their finished tests (the same stages as the admin dashboard). Cost per finished assessment = the ad's spend from Meta or Google Ads / that count.
- **Customers:** the same families with a saved card.
- **Visits per ad:** `select utm_source, utm_content, count(*) from public.ad_visits group by 1, 2;` (admins read the table). Visits that became a family: join `ad_visits.visit_id` to `parents.source->>'visit_id'`.
- **Where each ad's visitors stop:** per `utm_source` and `utm_content`, the visits, then the visits that reached each step, then the visits that became a family:

  ```sql
  select v.utm_source, v.utm_content, count(*) as visits,
    count(*) filter (where exists (select 1 from public.ad_visit_steps s where s.visit_id = v.visit_id and s.step = 'start_open')) as start_open,
    count(*) filter (where exists (select 1 from public.ad_visit_steps s where s.visit_id = v.visit_id and s.step in ('form_start', 'google_start'))) as form_or_google,
    count(*) filter (where exists (select 1 from public.ad_visit_steps s where s.visit_id = v.visit_id and s.step = 'code_sent')) as code_sent,
    count(*) filter (where exists (select 1 from public.parents p where p.source->>'visit_id' = v.visit_id::text)) as families
  from public.ad_visits v
  where v.visited_at >= '2026-10-19' and coalesce(v.utm_source, '') <> 'reviewcheck' and coalesce(v.utm_content, '') <> 'pixel-check'
  group by 1, 2 order by 1, 2;
  ```

  Steps start on the day this counter shipped (2026-10-22); visits before it have no steps.
- A visit is a raw count of browser tabs: one person who opens the ad in two tabs counts twice.
- Leave test families out (`public.test_accounts`), as the dashboard does.

## Setup

1. Apply `supabase/migrations/20261017_add_ad_visits.sql` and `supabase/migrations/20261022_add_ad_visit_steps.sql` before the code ships. Until the tables exist, `/api/visit` and `/api/visit/step` log "not counted" and the site works as before; signups still keep their tags.
2. Keep personal data out of the ad platforms. The site sends none, but both platforms can read the page themselves:
   - Meta Events Manager > the pixel > Settings: turn **off** Automatic Advanced Matching. When on, Meta reads form fields (email, name, postal code) on the page and sends them hashed.
   - Google Ads > Goals > Conversions > Settings: keep **enhanced conversions off** (it can read the signup form's email and name).
   - Check in Meta Events Manager > Test Events: open the site with the test code, accept cookies, create a test account, and confirm the `Lead` request carries no user data (no `ud[` parameters). The privacy page says we send them no name, email or postal code; it is true only with these settings.
3. Set the five variables in Vercel (Production; Preview only for a test with dummy or test IDs), then deploy.
4. In Meta Events Manager, check that `PageView` and `Lead` arrive; in Google Ads, the three conversions (accept the cookie banner first).
