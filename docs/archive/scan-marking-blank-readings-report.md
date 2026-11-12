# Shared blank-reading change

The shared marking prompt now requires positive visual evidence of an empty, readable answer area before it permits a blank result. Its version is `whole-page-scalar-readings-v7`.

Host: `Savars-MacBook-Pro-5.local`.
Branch: `t3/scan-marking-blank-readings`.
Prepared checkout: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-1193527a`.
Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-1193527a`.

The initial tracked state was clean at `96e845e558aa867a27d355679b6e24871360a944`. The branch fast-forwarded with `git merge --ff-only 677a9ddc20b987a10b6fabf4288e0041331b0577`. The tracked state was clean at that required base before edits. No branch switch or new checkout was used. All work ran on the Mac. No children were started.

## Change

The prompt tells every model to check for faint writing or marks. Failure to read a symbol cannot establish a blank area. It gives these existing issue codes:

| Evidence condition | State | Issue | Existing parent reason |
| --- | --- | --- | --- |
| Entire answer box or choice area is visible, readable and unmarked | blank | null | Blank |
| Blur could hide writing or marks | uncertain | blurry | The photo is blurry here. |
| Darkness, shadow or coverage prevents reading | uncertain | unreadable | We cannot read this answer. |
| Evidence is cut off | uncertain | cut-off | Part of this answer is cut off. |
| Evidence is missing | uncertain | missing | Part of this answer was not read. |

Production and comparison still use the same request builder and result reader. `runComparisonPhoto` calls `runScanMarking`. The tests compare the captured production request with `markingRequest` for the same frame and bytes. No model-specific rule was added.

## Quality guard decision

No new deterministic image guard was added. Inspection covered `scan-calibration.ts`, `scan-marking-store.ts`, `scan-marking.ts` and `scan-marking-comparison-run.ts`.

The calibration checks page identity and geometry. Its `pageFit` measures printed-cell agreement. The fit excludes supplied writing areas. Its correlation deliberately tolerates changes in shade and contrast. It cannot establish that an individual answer box is readable or empty. The marking frame supplies `ready`, measured regions and frozen question data. The image store supplies a normalized JPEG. Neither supplies a local answer-readability measurement.

A darkness or blur threshold would need new validation across writing, paper, lighting and resolution. A white patch can also be empty paper or coverage. No existing bounded signal supports a reliable conversion of a model blank for these cases. The implementation therefore changes only the prompt. If a model still returns blank with empty text and no issue for unreadable evidence, the existing reader still accepts it. Root must measure that remaining recognition risk.

## Changed paths

| Path | Change |
| --- | --- |
| `src/lib/scan-marking.ts` | Shared prompt and version only |
| `src/lib/scan-marking.test.ts` | Public request and returned-reading fixtures |
| `src/lib/scan-marking-comparison.test.ts` | Expected prompt version changes to v7 |
| `docs/scan-marking-blank-readings-report.md` | This report |

The request schema, parser, scoring, gates, D-267 thresholds, 13 model pins, fixed 40 image bytes and truth were not changed. The existing comparison identity includes the prompt version. It therefore creates a new run identity without a scoring or scheduling change. Maya, printing, templates, packages and family switches were not changed.

## Local proof

Before each check, the failure condition was stated: the new request checks must fail against the old prompt; uncertain readings must not receive a definite mark; written answers and parent methods must retain their behavior; comparison requests and model pins must remain compatible; types and lint must pass.

The prior-source control used the exact required base implementation. Before the first run, `git diff --exit-code 677a9ddc20b987a10b6fabf4288e0041331b0577 -- src/lib/scan-marking.ts` passed. Only the new tests differed from the base at that time.

| Command | Result | Evidence |
| --- | --- | --- |
| `node_modules/.bin/vitest run src/lib/scan-marking.test.ts --reporter=dot` against base source | 11 failed, 136 passed | `/tmp/scan-marking-blank-base-tests.log` |
| Same command after prompt repair | 147 passed | `/tmp/scan-marking-blank-candidate-tests.log` |
| `node_modules/.bin/vitest run src/lib/scan-marking.test.ts src/lib/scan-marking-ai.test.ts src/lib/scan-marking-comparison.test.ts --reporter=dot` | 263 passed in 3 files | `/tmp/scan-marking-blank-focused-tests.log` |
| `node_modules/.bin/tsc -p scripts/tsconfig.scan-marking.json` | Exit 0 | `/tmp/scan-marking-blank-typecheck.log` |
| `node_modules/.bin/eslint src/lib/scan-marking.ts src/lib/scan-marking.test.ts src/lib/scan-marking-comparison.test.ts` | Exit 0 | `/tmp/scan-marking-blank-lint.log` |

The prepared checkout had no dependencies. Its lockfile matched `root-workbook-comment-routing`. An APFS copy of that checkout's installed dependencies was made inside this checkout. No install or shared dependency write was used.

Request checks prove delivery of the positive empty-area rule and the issue mappings through the public production function. They also compare the complete production and comparison requests. They do not test a model's reading of pixels.

Observation checks prove that supplied empty/readable, written, unreadable, blurred, dark, shadowed, cut-off, covered and missing response fixtures retain their results and parent reasons. Contradictory blank responses with an uncertainty issue remain pending. Uncertain fixtures publish no learning event. These checks use fixed fake model outputs. They do not perform image analysis.

Existing format checks preserve number, fraction, decimal, word and choice behavior. Existing parent-method checks preserve parent review of both methods and the final answer. Comparison and adapter checks pass through fake transports and local budget seams. They do not establish hosted permissions, provider behavior, cost or recognition accuracy.

No image checks were added. No saved synthetic image bytes were changed. No full suite, Next build, browser, Chromium, renderer, paid inference, key read, hosted write, migration, push, PR or production merge ran. Root owns independent review, full checks and the exactly-two-model paid comparison. PD675 retains the heavy test window. The change makes no D-267 pass claim.
