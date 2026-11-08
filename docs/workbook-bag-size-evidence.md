# Probability bag size correction

Follow-up to the P2 SPEC finding on PR #659 at `90600c96a7452c8fed1b67de4695a75002354ea0`. The workbook round guide puts smaller findings in follow-up PRs. This correction is based on that commit.

## Change

The final `4.17-predict-outcome` step specifies a bag of 8 to 12 items. Its two changed bag templates sampled each colour from 1 to 12 without limiting the total. Both templates now require `a != b + c and 8 <= a + b + c <= 12`. Code still compares red with the combined other colours. The source data, author-change record and generated BC data agree. `npm run import:curriculum` generated the BC file.

## Binding checks

The four public-interface regression tests fail on the parent commit. For each template, 239 of 256 seeded outputs exceed the bag range. The uncorrected template wrongly admits 1,489 count combinations.

The same four tests pass on the correction. Each template is checked against all 1,728 combinations of positive colour counts from 1 to 12. It accepts the 173 combinations that meet the total and comparison rules and rejects the other 1,555. There are no incorrect admissions or rejections.

For each template, 256 seeded fills cover every legal total and both answer outcomes. All 512 fills have correct keys, unequal outcomes and a total from 8 to 12. Per-template total counts are: 8 items, 34 fills; 9 items, 46; 10 items, 48; 11 items, 61; 12 items, 67. Red is more likely in 42 fills; the other colours are more likely in 214.

The affected Day 4 first-customer fake run uses seed `17fc5da1-2442-488a-a450-611a471e73e6`. The public generator and strict Chromium print check pass: 12 pages, 78 questions, no question, fit, render or omission failures, and a 30.8-minute day estimate. The two printed bag questions contain 10 and 9 items. This is a selected-day check, not a new full-book or real-provider result.

```sh
npm test -- src/lib/workbook-curriculum/probability-bag.test.ts --maxWorkers=1
npm run import:curriculum -- --check
WORKBOOK_SAMPLE_ID=17fc5da1-2442-488a-a450-611a471e73e6 npm run workbook:fast -- --levels U16 --persona first-customer --days 4 --out ~/unica-workbook-samples/659-bag-day4
```

## Gate and transfer

The corrected source was checked on Savars-MacBook-Pro-5.local in the original isolated worktree. The five changed source files were copied into `root-workbook-bag-size`, branch `site/workbook-bag-size`. Their SHA-256 hashes match the checked files. Both worktrees have the same parent commit. The four regression tests and curriculum import check also pass in the follow-up worktree.

- Full test suite: passed, 398 files and 15,629 tests, with one skipped test, in 398.27 seconds. Command: `caffeinate -i npm test -- --maxWorkers=2`.
- Source lint: passed.
- Default `npm run build`: failed because Turbopack rejects the external `node_modules` symlink.
- `npm run build -- --webpack`: passed, including the TypeScript check. This is an alternate production build; the default build result remains a failure.

The gate commands used two Vitest workers and `caffeinate -i`. Raw logs, source hashes, admission and seeded distributions are in `~/unica-workbook-samples/resume-20261105/659-bag-*`. The selected-day draft, page text and manifest are in `~/unica-workbook-samples/659-bag-day4`.

## Proof limits

The template checks establish local count-domain admission and answer correctness. The selected-day check establishes that fake generation and the local strict print path use the correction. The lint and alternate build establish source and type compatibility. These checks do not establish real AI wording, hosted operation or sample approval.

The full fake books and counts in `workbook-fill-cells-evidence.md` belong to the parent commit. The SPEC review found an out-of-range bag in that U16 artifact. Its `ready=true` result does not prove the bag-domain requirement. No new full fake books or real sample pair were generated for this small correction. The real sample pipeline still requires an available Claude subscription. The user requires Unify Codex only, so no Claude or paid fallback calls were made.

The P3 possible duplication from the standards review remains separate. No printed defect was confirmed for it. The real sample, customer approval, merge and full customer regeneration remain on hold.
