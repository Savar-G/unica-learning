# Door-to-door flyer A/B test

Two printed flyers, each with its own QR code. The site counts scans and keeps each signup's flyer, so the admin page can compare them.

## How it works

1. Flyer A's QR code is `https://unicalearning.com/f/a`. Flyer B's is `https://unicalearning.com/f/b`.
2. `src/app/f/[code]/route.ts` counts the scan (`flyer_scans`, after the response, so it never slows or breaks the redirect), then redirects to `/start?utm_source=flyer&utm_medium=print&utm_campaign=door-to-door&utm_content=<code>`.
3. The signup form already keeps the UTM tags of the page it is on (`collectSource` in `src/components/account.tsx`), so the family's `parents.source` holds `utm_source=flyer` and `utm_content=a|b`.
4. `/admin/flyers` joins the scans, the "handed out" counts (`flyer_batches`, typed in on that page) and the families' stages (the same stage logic as the dashboard) into one table per flyer, with a verdict.

Link previews, crawlers and requests with no user agent are redirected but not counted. No IP, device or cookie is stored. A scan is a raw count: one person scanning twice counts twice.

## Reading the result

The measure that decides the test is **signups per 100 flyers handed out**. Scans are a softer signal (curiosity, repeat scans).

- Under 10 signups in total: no call. One more family can change the order.
- At 10 or more: a two-proportion z-test on signups per flyer handed out. p < 0.05 is called a clear winner, p < 0.2 is "leaning", anything above is "no clear difference".

Run it fairly: alternate A and B house by house on the same streets in the same hours, hand out about equal numbers, and do not change a flyer, the price or the offer mid-test.

## Adding a flyer

Add it to `FLYERS` in `src/lib/flyers.ts`, regenerate its QR code from `flyerUrl(code)`, and add a row to `flyer_batches`. The route, the page and the funnel pick it up. (The page's table has two columns today; a third flyer needs a third column in `src/components/admin-flyers.tsx`.)

## Setup

Apply `supabase/migrations/20261016_add_flyer_tracking.sql` before the code ships. Until the tables exist the page says so, scans are not counted, and signups are still tagged.
