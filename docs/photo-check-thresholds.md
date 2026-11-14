# Photo check at upload: thresholds

The photo check (#855, spec #850 slice C) asks a decision model whether the answers in a calibrated photo can be read. The parent learns within seconds that the photo is blurry, and can take it again or send it anyway. This file records how the threshold was made and what it gave.

## What the check does

- Module: `src/lib/scan-photo-check.ts`. Store: `src/lib/scan-photo-check-store.ts` (database functions `claim_photo_check` and `finish_photo_check`, migration `20261111234014_scan_photo_check`). In-memory store for tests: `src/lib/scan-photo-check-memory.ts`.
- When the preview route (`POST /api/account/scans/[id]/preview`) has a ready page, it claims the check and writes `photo_check = {"state":"pending"}` before it answers. It runs the check after the answer (`after` from `next/server`), so the check never delays the answer.
- The check sends one request to the decision model (`DECISION_MODEL`, default `typesafe/jev-1.14`): a short text that states the task, and the straightened page scaled to fit 1,568 px on its long side (JPEG). The text holds no child data. One try, one time limit of 3 s.
- Only `blurry` is asked in this first release: "Is the handwriting in the answer boxes blurry?". `glare`, `shadow` and `faint` have no threshold, so they are not asked. They wait for labelled real photos (slice B).
- Result states in `scan_photos.photo_check`: null (not eligible, never started), `pending`, `done` (the probabilities, the first problem, the model, the threshold version, the cost and the time), `unknown` (the error kind). An error, a time-out, a price refusal or a safety block is `unknown`. The parent then sees nothing.
- Who (#856): every family `scanChecksAccess` allows for the photo, and only when `DECISIONS_OPENROUTER_API_KEY` is set: test families and admins, and in families mode (`SCAN_MARKING_ENABLED=families`) a child whose plan is running. The privacy page names the provider (#854). For any other family, nothing runs and nothing is stored. The server's decision goes to the database as it is (`p_access`; migration `20261114052503_photo_check_access_in_transaction`, five-argument `claim_photo_check` and `finish_photo_check` beside the four-argument ones the earlier site version calls). `closed` refuses whatever the family's membership: an explicit denial is never turned into the test check. `test` (test families and admins) is checked by the database as below. `families` (a running plan in families mode) is checked again in the claim's and the finish's transaction on the photo's child's row in `child_plan_states`, under a share lock, by the rule of `planAccessRule` (free month with a first charge, paying, or ending before its end; no row or anything else is closed), so a plan that closes between the server's read and the write makes the write refuse and clears the pending claim. The server also asks its decision again right before the photo is sent. Membership is checked three times (migration `20261112001459_photo_check_eligibility`, function `photo_check_eligible`): in the claim's transaction, again inside the decision client right before the photo is sent (the request's `beforeSend` hook, which runs after every price wait, so a price read that starts inside `decide()` cannot let a removed family through), and in the finish's transaction. The claim and the finish first lock the parent row, which `admin_set_test_account` also locks, so they read a removal as committed. A family removed before the request gets no request; a family removed during it gets no stored result. In both cases the pending claim is removed.
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

## Real photos (2026-11-14, #856)

Set: Cedric's iPhone photos of the made-up Robin booklet (#852): 10 clear, 3 shadow, 10 blurry, 10 glare (6 of them a crumpled plastic bag over the page, 4 a lamp or flash). No faint photo was taken. Their labels are the problem each photo was taken to show; a person can still read most of the shadow and glare photos (the #852 truth review).

The check runs only on a page that calibrated (a ready page), so it was asked about the straightened pages the Robin phone test made (`scripts/scan-marking-physical.mjs --estimate`). Calibration refused 17 photos before the check would run: all 10 blurry, 6 glare (pages 3, 4, 5, 7, 8, 9) and the page 3 shadow photo. That leaves 16: 10 clear, 2 shadow, 4 glare, 0 blurry. All four questions in one request per photo, two runs, model `typesafe/jev-1.14`. Results: `docs/photo-check-real-results-20261114.json` (photo names, image hashes and every answer; no images).

Rule for a real-photo threshold (`kindThreshold`): of the thresholds from 0.50 to 0.99 that flag no clear photo, those that flag the most photos of the kind, and the middle of that range. A kind ships only with at least 5 photos of it (`PHOTO_CHECK_MIN_PROBLEM_PHOTOS`; each photo counts once over the runs) and at least 80% of them caught.

| Question | Highest on a clear photo | Its photos | Caught | Ships |
|---|---|---|---|---|
| blurry | 0.10 | 0 (all refused by calibration) | none to catch | stays at 0.50 (synthetic evidence; 0 of 20 real clear asks flagged) |
| glare | 0.17 | 4 photos: 0.04, 0.07, 0.14, and the plastic bag 0.79 to 0.86 | 1 of 4 | no |
| shadow | 0.22 | 2 photos: 0.18 to 0.29 | 0 of 2 | no |
| faint | 0.04 | none | none | no |

- No threshold changed, so `PHOTO_CHECK_VERSION` stays 1.
- What this shows: on these phones, a blurry or badly lit photo is refused by calibration before the check sees it, and a photo that calibrates is one the model mostly reads as fine. The glare question flags the bag photo, the one photo where glare covers answers; the other glare and shadow photos leave the answer boxes readable, and the model says so.
- Glare and shadow can be measured again with at least 5 calibrated photos of each where the light or shadow really covers answer boxes, and faint with at least 5 faint photos. Android is not tested.
- Cost: USD 0.007241 for 32 requests, all priced. Latency p50 272 ms, p95 608 ms; none failed.

Run it again (the folder is a Robin phone test output with `set.json` and `images/`):

```bash
DECISIONS_OPENROUTER_API_KEY=... node scripts/photo-check-thresholds.mjs --physical /path/to/robin-estimate --runs 2 --max-usd 0.1 [--estimate]
```

## How to run it again

```bash
SET=/Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/comparison/robin-fixed40
DECISIONS_OPENROUTER_API_KEY="$(security find-generic-password -s decisions-openrouter-unica -a unica -w)" \
  node scripts/photo-check-thresholds.mjs --set "$SET" --runs 2 --max-usd 0.5
```

`--max-usd` must be a number of at least 0. Each request is admitted only when its whole cost bound fits under the cap (`costCap` from the #851 comparison), and is settled at its known cost plus the bound of each attempt that gave no cost. So `--max-usd 0` sends nothing (checked 2026-11-11: 40 of 40 not admitted, USD 0). The script reads the set folder and never writes into it. It writes the raw answers to `.workbook-sample/photo-check/` (gitignored) and never prints the key. `--question` takes `blurry` (default), `glare`, `shadow` or `faint`; `--model` takes a model of `DECISION_MODELS`.

### Second real run (2026-11-14, 53 photos)

Cedric added 20 photos: 10 clear single pages, 5 flash or lamp glare and 5 hand or phone shadow, with the corners and QR codes in view. The page check (main plus #954's stacked-sheet fix) accepted 37 of 53, so the check was asked about 18 clear, 11 glare and 8 shadow pages, two runs each, on `typesafe/jev-1.14` (74 requests, USD 0.0167, 0 failures). Results: `docs/photo-check-real-results-20261114-v2.json` (names, hashes and every answer; no images).

| Question | Highest on a clear photo | Its own photos | Caught | Ships? |
|---|---|---|---|---|
| blurry | 0.13 | 0 (every blurry photo is refused by the page check first) | - | no |
| glare | 0.20 | 11 | 1 photo (the plastic bag, 0.84); the 10 flash or lamp photos 0.04 to 0.20 | no |
| shadow | 0.45 | 8 | 1 photo surely (0.82 to 0.85), one at 0.48 to 0.54; the rest 0.06 to 0.36 | no |
| faint | 0.05 | 0 | - | no |

No kind ships, so the thresholds and their version do not change. What it shows: in these photos the glare and the shadow left every answer readable (each was checked by eye for the truth file), and Jev rates them like clear pages. The photos the page check refuses (QR not read, ambiguous page) are where a parent needs a sentence, so the refusal messages, not the check, are where "too much glare" and "too blurry" belong for now.

