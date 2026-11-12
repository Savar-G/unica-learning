# Photo check at upload: thresholds

The photo check (#855, spec #850 slice C) asks a decision model whether the answers in a calibrated photo can be read. The parent learns within seconds that the photo is blurry, and can take it again or send it anyway. This file records how the threshold was made and what it gave.

## What the check does

- Module: `src/lib/scan-photo-check.ts`. Store: `src/lib/scan-photo-check-store.ts` (database functions `claim_photo_check` and `finish_photo_check`, migration `20261111234014_scan_photo_check`). In-memory store for tests: `src/lib/scan-photo-check-memory.ts`.
- When the preview route (`POST /api/account/scans/[id]/preview`) has a ready page, it claims the check and writes `photo_check = {"state":"pending"}` before it answers. It runs the check after the answer (`after` from `next/server`), so the check never delays the answer.
- The check sends one request to the decision model (`DECISION_MODEL`, default `typesafe/jev-1.14`): a short text that states the task, and the straightened page scaled to fit 1,568 px on its long side (JPEG). The text holds no child data. One try, one time limit of 3 s.
- Only `blurry` is asked in this first release: "Is the handwriting in the answer boxes blurry?". `glare`, `shadow` and `faint` have no threshold, so they are not asked. They wait for labelled real photos (slice B).
- Result states in `scan_photos.photo_check`: null (not eligible, never started), `pending`, `done` (the probabilities, the first problem, the model, the threshold version, the cost and the time), `unknown` (the error kind). An error, a time-out, a price refusal or a safety block is `unknown`. The parent then sees nothing.
- Who: only a family in `public.test_accounts` or an admin, and only when `DECISIONS_OPENROUTER_API_KEY` is set. For any other family, nothing runs and nothing is stored. Real families wait for the privacy disclosure (slice E). Membership is checked three times (migration `20261112001459_photo_check_eligibility`, function `photo_check_eligible`): in the claim's transaction, again right before the request (after the page and the live price are read), and in the finish's transaction. The claim and the finish first lock the parent row, which `admin_set_test_account` also locks, so they read a removal as committed. A family removed before the request gets no request; a family removed during it gets no stored result. In both cases the pending claim is removed.
- The preview screen (`src/components/scan-preview.tsx`) asks again every 1 s while the state is `pending`, until one fixed deadline 6 s after the first answer. At the deadline it stops waiting and shows no problem; an answer that comes later is not shown (the server still stores it). A problem shows "The photo is blurry. Hold the phone still and take it again." with "Take again" (main, on a phone) and "Send anyway" (second; it sends this one photo for marking). Nothing is blocked. A result that comes later is stored and not shown.
- The admin scan page (`/admin/scans/[id]`) shows the values in the "Photo check" section.

## The threshold rule

For each question: the lowest value from 0.50 to 0.99 (steps of 0.01) that flags none of the clear photos. A question ships only when that threshold flags at least 80% of its problem photos. Otherwise its threshold stays null and the question is not asked. The thresholds are constants in `PHOTO_CHECK_THRESHOLDS` with the version `PHOTO_CHECK_VERSION`, which each stored result keeps.

## Result (2026-11-11, version 1)

Set: the fixed 40 synthetic photos (`robin-fixed40`: 10 blurry, 30 clear, which are 10 right, 10 wrong and 10 blank pages). The synthetic photos are drawn on the page image, so each photo is its own straightened page. Model `typesafe/jev-1.14`. Two full runs, 80 requests.

| | Run 1 | Run 2 |
|---|---|---|
| Highest P(blurry) on a clear photo | 0.05 | 0.05 |
| Lowest P(blurry) on a blurry photo | 0.82 | 0.82 |
| Threshold | 0.50 | 0.50 |
| Clear photos flagged | 0 of 30 | 0 of 30 |
| Blurry photos flagged | 10 of 10 | 10 of 10 |
| Failed requests | 0 | 0 |

- `blurry` threshold: **0.50**. It passes the rule, so the check is on for test families and admins.
- Latency: p50 199 ms, p95 391 ms, none above 3 s.
- Cost: USD 0.017942 for the 80 requests (about USD 0.0002 a photo), all priced.
- Limit: the blurry photos are synthetic blur. Real phone blur, glare, shadow and faint writing need the labelled real photos of slice B before the threshold is trusted for real families.

## Hosted browser check (2026-11-11)

Synthetic test families from `scripts/scan-crops-hosted.ts` (a real printed book, drawn answers, a perspective "photo"), the local app with the real decision model, and Aside. Then the families were deleted.

| Photo | Calibration | P(blurry) | Shown |
|---|---|---|---|
| Clear | ready | 0.04 | no problem |
| Gaussian blur, sigma 4, QR strip kept sharp | ready | 0.28 | no problem (the digits are still readable) |
| Gaussian blur, sigma 4.6, 5 and 6 | refused (page-mismatch) | not run | the existing refusal |
| Gaussian blur, sigma 10; motion blur 15 px | refused (marks-missing) | not run | the existing refusal |

So on these synthetic pages, calibration refuses a photo before it is blurry enough for the check to flag it. Real phone photos can differ: slice B gives the evidence. The problem screen was checked with the development fake (`PHOTO_CHECK_FAKE=blurry`, ignored in production): pending for about 1.5 s, then the problem, "Take again" and "Send anyway"; "Send anyway" sent that one page for marking.

## How to run it again

```bash
SET=/Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/comparison/robin-fixed40
DECISIONS_OPENROUTER_API_KEY="$(security find-generic-password -s decisions-openrouter-unica -a unica -w)" \
  node scripts/photo-check-thresholds.mjs --set "$SET" --runs 2 --max-usd 0.5
```

`--max-usd` must be a number of at least 0. Each request is admitted only when its whole cost bound fits under the cap (`costCap` from the #851 comparison), and is settled at its known cost plus the bound of each attempt that gave no cost. So `--max-usd 0` sends nothing (checked 2026-11-11: 40 of 40 not admitted, USD 0). The script reads the set folder and never writes into it. It writes the raw answers to `.workbook-sample/photo-check/` (gitignored) and never prints the key. `--question` takes `blurry` (default), `glare`, `shadow` or `faint`; `--model` takes a model of `DECISION_MODELS`.
