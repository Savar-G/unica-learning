# Decision second opinion on real Robin photos (#853), 2026-11-14

**Set:** 53 iPhone photos of the made-up Robin booklet (Cedric, 2026-11-13: 10 clear + 13 problem photos, then 10 clear + 5 glare + 5 shadow), human truth checked photo by photo. The page check (main + #954's stacked-sheet fix) accepted 37; 16 were refused (listed below). Items asked: 158 right, 73 wrong, 36 blank (the ≥40 wrong / ≥20 blank bar is met). One phone only: Android not tested.

**Result**
- `typesafe/jev-1.14`: **passes**. 0 false Right at every threshold from 0.50 to 0.99; 96.8% of right items confirmed at 0.50 (89.2% at 0.80, 84.8% at 0.90). 287 requests, 0 errors, USD 0.0082, p50 185 ms.
- `google/gemini-decision-1`: **no result**. Every request was refused by OpenRouter before any charge: "No endpoints found matching your data policy (Zero data retention)". The adapter asks for ZDR and Google AI Studio does not offer it. Under D-337/#900 (no child data to Google) Gemini is not a production candidate either.

**Winner (rule from #850 / `comparisonWinner`):** Jev at threshold **0.50**: the lowest threshold with 0 false Right and ≥80% right confirmed on both sets. The synthetic side is taken from the stored #863 result (0 false Right at every threshold from 0.50; Jev confirms 97.3% at 0.80), because the synthetic run's `report.json` is not stored in the repo, so `--synthetic-report` could not be run; the rule was applied by hand.

**Tool issue found:** with `--concurrency 4` the Gemini pass exited silently with no results (status 0, nothing written). With `--concurrency 1` it ran to the end. Not yet fixed.

## Report (Jev run)

# Decision second-opinion comparison

Real phone photos of the made-up Robin booklet (iphone): 37 photos; items asked: 158 right, 73 wrong, 36 blank, 0 uncertain; 287 requests per model. Rows left out (parent or team-marked two ways): 5.
Photos the page check refused (not asked: no straightened page to crop): 16 (iphone-page-2-blurry.jpg: qr; iphone-page-3-blurry.jpg: calibration:marks-missing; iphone-page-4-blurry.jpg: calibration:ambiguous-page; iphone-page-5-blurry.jpg: calibration:marks-missing; iphone-page-6-blurry.jpg: qr; iphone-page-8-blurry.jpg: qr; iphone-page-7-blurry.jpg: qr; iphone-page-9-blurry.jpg: calibration:marks-inconsistent; iphone-page-10-blurry.jpg: qr; iphone-page-11-blurry.jpg: qr; iphone-page-3-glare.jpg: calibration:ambiguous-page; iphone-page-8-glare.jpg: qr; iphone-page-7-glare.jpg: calibration:page-mismatch; iphone-page-9-glare.jpg: qr; iphone2-page-5.jpg: qr; iphone2-page-10.jpg: qr).
One phone only: Android not tested. This set does not stand in for the spec's two-phone set.
Pass bar: 0 false Right, with every wrong, blank and uncertain request answered, and at least 80% of right items confirmed at the same threshold.
Cost cap: USD 0.1; spent USD 0.008192 (known costs, and the bound of each attempt with a missing cost).

| Model | Lowest 0-false-Right threshold | Confirm rate there | Passes | Cost | Cost per photo | p50 latency | p95 latency | Errors |
|---|---|---|---|---|---|---|---|---|
| typesafe/jev-1.14 | 0.50 | 96.8% | yes | USD 0.008192 | USD 0.000221 | 185 ms | 341 ms | 0 |

## typesafe/jev-1.14

Providers: TypeSafe 287.

| Threshold | Right confirmed | Confirm rate | False Right | wrong | blank | uncertain |
|---|---|---|---|---|---|---|
| 0.50 | 153/158 | 96.8% | 0 | 0 | 0 | 0 |
| 0.51 | 151/158 | 95.6% | 0 | 0 | 0 | 0 |
| 0.52 | 150/158 | 94.9% | 0 | 0 | 0 | 0 |
| 0.53 | 149/158 | 94.3% | 0 | 0 | 0 | 0 |
| 0.54 | 149/158 | 94.3% | 0 | 0 | 0 | 0 |
| 0.55 | 149/158 | 94.3% | 0 | 0 | 0 | 0 |
| 0.56 | 146/158 | 92.4% | 0 | 0 | 0 | 0 |
| 0.57 | 146/158 | 92.4% | 0 | 0 | 0 | 0 |
| 0.58 | 146/158 | 92.4% | 0 | 0 | 0 | 0 |
| 0.59 | 146/158 | 92.4% | 0 | 0 | 0 | 0 |
| 0.60 | 146/158 | 92.4% | 0 | 0 | 0 | 0 |
| 0.61 | 145/158 | 91.8% | 0 | 0 | 0 | 0 |
| 0.62 | 144/158 | 91.1% | 0 | 0 | 0 | 0 |
| 0.63 | 144/158 | 91.1% | 0 | 0 | 0 | 0 |
| 0.64 | 144/158 | 91.1% | 0 | 0 | 0 | 0 |
| 0.65 | 144/158 | 91.1% | 0 | 0 | 0 | 0 |
| 0.66 | 144/158 | 91.1% | 0 | 0 | 0 | 0 |
| 0.67 | 144/158 | 91.1% | 0 | 0 | 0 | 0 |
| 0.68 | 143/158 | 90.5% | 0 | 0 | 0 | 0 |
| 0.69 | 143/158 | 90.5% | 0 | 0 | 0 | 0 |
| 0.70 | 143/158 | 90.5% | 0 | 0 | 0 | 0 |
| 0.71 | 142/158 | 89.9% | 0 | 0 | 0 | 0 |
| 0.72 | 141/158 | 89.2% | 0 | 0 | 0 | 0 |
| 0.73 | 141/158 | 89.2% | 0 | 0 | 0 | 0 |
| 0.74 | 141/158 | 89.2% | 0 | 0 | 0 | 0 |
| 0.75 | 141/158 | 89.2% | 0 | 0 | 0 | 0 |
| 0.76 | 141/158 | 89.2% | 0 | 0 | 0 | 0 |
| 0.77 | 141/158 | 89.2% | 0 | 0 | 0 | 0 |
| 0.78 | 141/158 | 89.2% | 0 | 0 | 0 | 0 |
| 0.79 | 141/158 | 89.2% | 0 | 0 | 0 | 0 |
| 0.80 | 141/158 | 89.2% | 0 | 0 | 0 | 0 |
| 0.81 | 140/158 | 88.6% | 0 | 0 | 0 | 0 |
| 0.82 | 139/158 | 88.0% | 0 | 0 | 0 | 0 |
| 0.83 | 139/158 | 88.0% | 0 | 0 | 0 | 0 |
| 0.84 | 139/158 | 88.0% | 0 | 0 | 0 | 0 |
| 0.85 | 138/158 | 87.3% | 0 | 0 | 0 | 0 |
| 0.86 | 138/158 | 87.3% | 0 | 0 | 0 | 0 |
| 0.87 | 137/158 | 86.7% | 0 | 0 | 0 | 0 |
| 0.88 | 136/158 | 86.1% | 0 | 0 | 0 | 0 |
| 0.89 | 135/158 | 85.4% | 0 | 0 | 0 | 0 |
| 0.90 | 134/158 | 84.8% | 0 | 0 | 0 | 0 |
| 0.91 | 133/158 | 84.2% | 0 | 0 | 0 | 0 |
| 0.92 | 128/158 | 81.0% | 0 | 0 | 0 | 0 |
| 0.93 | 123/158 | 77.8% | 0 | 0 | 0 | 0 |
| 0.94 | 120/158 | 75.9% | 0 | 0 | 0 | 0 |
| 0.95 | 109/158 | 69.0% | 0 | 0 | 0 | 0 |
| 0.96 | 88/158 | 55.7% | 0 | 0 | 0 | 0 |
| 0.97 | 38/158 | 24.1% | 0 | 0 | 0 | 0 |
| 0.98 | 25/158 | 15.8% | 0 | 0 | 0 | 0 |
| 0.99 | 16/158 | 10.1% | 0 | 0 | 0 | 0 |

Reliability (item P(yes) band against the share of right items):

| P(yes) | Items | Right | Right rate |
|---|---|---|---|
| 0.0-0.1 | 109 | 0 | 0.0% |
| 0.1-0.2 | 3 | 3 | 100.0% |
| 0.2-0.3 | 1 | 1 | 100.0% |
| 0.3-0.4 | 0 | 0 | none |
| 0.4-0.5 | 1 | 1 | 100.0% |
| 0.5-0.6 | 7 | 7 | 100.0% |
| 0.6-0.7 | 3 | 3 | 100.0% |
| 0.7-0.8 | 2 | 2 | 100.0% |
| 0.8-0.9 | 7 | 7 | 100.0% |
| 0.9-1.0 | 134 | 134 | 100.0% |

## Rows left out (parent or team-marked two ways)

- iphone-page-11.jpg: 5ca70000-0000-4000-8000-000000000542:d2p4s2.1 (two-ways)
- iphone-page-11-shadow.jpg: 5ca70000-0000-4000-8000-000000000542:d2p4s2.1 (two-ways)
- iphone-page-11-glare.jpg: 5ca70000-0000-4000-8000-000000000542:d2p4s2.1 (two-ways)
- iphone2-page-11.jpg: 5ca70000-0000-4000-8000-000000000542:d2p4s2.1 (two-ways)
- iphone2-page-11-shadow2.jpg: 5ca70000-0000-4000-8000-000000000542:d2p4s2.1 (two-ways)
