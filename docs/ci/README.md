# CI performance

The full suite must pass on the proposed merge before main changes. Do not reduce PR test coverage until an enforced merge queue runs the full suite. Do not retry tests, raise timeouts, or skip tests to meet a speed target.

## Baseline: 2026-11-15

Source: the latest 150 `CI` workflow run IDs at the audit cutoff, from 2026-11-15 02:54:39 UTC to 18:50:29 UTC. These are 117 PR runs and 33 main push runs. Conclusions: 97 success, 45 cancelled, 5 failure, and 3 still running at collection. The snapshot has 742 jobs. One run has a second attempt. The report contains the latest attempt for each run; it does not claim complete billing for earlier attempts.

Successful PR feedback: p50 **1,127 seconds** (18m 47s), p95 **1,282 seconds** (21m 22s), 66 runs. Successful main feedback: p50 1,162 seconds, p95 1,279 seconds, 31 runs. Failure and cancellation distributions are separate in `baseline-2026-11-15.json`. Excluding them from the success distribution prevents an early cancellation from looking like a speed gain.

Successful PR jobs, seconds. Each cell is p50 / p95:

| Job | Samples | Runner wait | Setup | Running |
| --- | ---: | ---: | ---: | ---: |
| Unit 1/2 | 71 | 2 / 2 | 46 / 55 | 888 / 1,210 |
| Unit 2/2 | 70 | 2 / 3 | 43 / 51 | 755 / 1,109 |
| Checks | 109 | 2 / 2 | 46 / 53 | 272 / 373 |
| Maya behaviour and word limits | 112 | 2 / 3 | 33 / 38 | 150 / 203 |
| Required `test` result | 66 | 2 / 2 | 1 / 1 | 0 / 2 |

Percentiles use nearest rank. Job wait starts at job creation, not workflow creation; the final `test` job must first wait for its dependencies. The workflow feedback distribution includes that dependency wait. Setup ends at the first work step. Running includes gaps between work steps. Cleanup is separate, and setup + running + cleanup equals the job duration for each complete record. Three copied jobs in a partial rerun have a creation time later than their original start; their wait is unknown, not zero. Pending and incomplete intervals remain null.

Unit execution is the largest measured delay. In successful median unit job [132903227184](https://github.com/Savar-G/unica-learning/actions/runs/43744017266/job/132903227184), Vitest reports 851.88 s wall time: transform 29.61 s, import 216.09 worker-seconds, tests 2,237.45 worker-seconds, environment 6.90 s. Worker-seconds overlap and must not be added to wall time. Its slowest files include `maya/example-flow.test.ts` (371.74 s) and `scan-binding-chromium.test.ts` (352.75 s). The job retained 447 passing files, 2 existing skipped files, 13,825 passing tests and 10 existing skipped tests.

The `checks` job serializes database probes, lint, app type checks and voice checks. Across successful jobs its median step times are 89 s, 58 s, 62 s, 16 s (voice types) and 45 s (voice tests). Splitting this job improves its latency but does not remove the much longer unit path.

## Reproduce

Use the GitHub CLI with repository read access:

```sh
node scripts/ci-audit.mjs collect /tmp/unica-ci-audit Savar-G/unica-learning 150
node scripts/ci-audit.mjs report /tmp/unica-ci-audit
node --test scripts/ci-audit.test.mjs
```

`collect` writes the frozen run list, every job page, and `audit.json`. `report` performs no network requests. Do not commit credentials or unfiltered job logs. Keep raw evidence outside the repository. The committed baseline includes every job group split by source event and conclusion.

## Release gate and account limits

At the cutoff, main requires the `test` check, with `strict: false`; administrator enforcement is off. The repository has no rulesets. CI runs on `pull_request`, main `push`, and manual dispatch. It does not yet run on `merge_group`. The blog workflow also writes main directly after its own full validation.

The repository is public and owned by personal account `Savar-G`. GitHub merge queues require organization ownership. Enabling a queue therefore needs an account decision before PR selection can be safe. See [GitHub queue requirements](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue).

Runner wait already meets the 10 s target in this sample. No self-hosted runner is registered. The installations API returned 404, so Blacksmith account availability is unverified. Do not change runner labels to an unavailable service. Blacksmith would add a vendor bill to currently free public-repository GitHub runners. See [Blacksmith pricing](https://www.blacksmith.sh/pricing).

The snapshot records 5,878 rounded completed-job runner minutes, including cancelled and failed jobs. Running jobs and earlier attempts are excluded. This is observed runner use, not invoice data or a monthly forecast.
