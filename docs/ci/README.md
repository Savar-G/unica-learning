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

## Local comparisons and limits

All comparisons below used macOS arm64 on Savar's MacBook Pro (4). They establish local behavior. They do not establish Linux runner performance or the requested hosted p50/p95.

- Type check: at audit base `275e329e5`, TypeScript 5.9.3 passed in 42.320 s and native TypeScript preview passed in 4.217 s. Bun 1.4.4 took 0.780 s but reported a tuple error both TypeScript compilers accepted. A separate small PR uses the native compiler. At its newer base `fb98903a`, clean checks took 35.270 s with TypeScript 5 and 3.982 s with the native compiler. Deliberate app, React prop and voice worker errors produced matching diagnostic codes in both compilers. This is bounded compatibility evidence.
- Install: clean directories with the same package and lock files took 10.359 s with `npm ci`, versus 16.061 s with Bun 1.4.4. Bun also blocked four dependency lifecycle scripts. Keep npm on this evidence. No global runtime changed.
- Installed-tree cache: the exact installed tree compressed to 275,157,860 bytes. Local zstd save took 37.152 s and restore took 24.841 s, versus 10.359 s for npm installation. Network transfer would add time. The candidate action is retained with the external audit evidence, but is not enabled. A Linux or Blacksmith comparison is still needed before adopting it.
- Lint: ESLint passed with zero errors and warnings in 38.096 s. The initial Oxlint comparison took 0.242 s, but configuration migration omitted seven existing rules. With the configuration in the repository, Oxlint reported ten errors and one warning, where ESLint reported none. The migration also omitted parser/resolver settings. Do not delete the existing lint gate until diagnostics and rule coverage agree. The default formatter is absent; there is no Prettier installation to remove.
- Test isolation: a five-file sample passed 193 tests in both modes, so that sample was insufficient. A broader 136-file UI/route comparison, shuffled with seed 17 and four workers, had 9 failures with shared modules and 2 with isolation. Seven additional failures came from sharing, including a retained `next/navigation` mock. The two common failures were retained mock calls in the child-deletion route test and retained browser storage in the desk chat test. A separate small PR resets that state. Both files then passed all 40 tests with seeds 1, 17 and 31. Do not set `isolate: false` on the current suite.

A full local baseline ran 902 files in 619.72 s: 898 passed, one failed, three had existing skips. It passed 29,083 tests, failed one, and had 36 existing skips plus one existing todo. The failure was the Chromium test for partly clipped question content, at its existing 60 s timeout. The initiating cause is not established. The build and ESLint passed. This baseline is not a green full gate, and it is not an after-change result.

The one partial rerun in the hosted sample had an original Maya gate failure: 36,755 ms against its 30,000 ms assertion (`gate.test.ts:136`, job `132902806859`). Its second attempt passed. That is a missed performance budget, not evidence that the first failure can be ignored. Another failed run ended with a runner shutdown signal; its logs do not establish an assertion failure. No retry or larger timeout was added by this work.

## Remaining acceptance work

The targets remain unmet. No hosted after-change distribution exists yet.

1. Resolve organization ownership and enforce the merge queue. Add `merge_group` CI coverage and require the full suite before enabling PR selection. Include the blog direct-push path in that change.
2. Benchmark approved Blacksmith runners with eight cores before adding shards. Keep per-job CPU concurrency bounded. Keep synthetic databases separate. The current runner wait already meets its target, but Blacksmith may improve execution.
3. Resolve shared mock/module state before changing test isolation. Keep every existing case and assertion. Use measured file durations for later sharding.
4. Move lint, app types, voice checks, build and database probes into parallel jobs after the execution bottleneck is addressed. Require every job from `test`.
5. Recheck dependency caching on the target Linux runner. Measure exact PR cache hits across real runs; there is no verified 95% installed-tree cache hit rate yet.
6. Add a pre-push hook after the accepted tool changes land. Check format, lint and types. Use complete project type checks for shared types. Demonstrate a nonzero exit on an injected defect and measure the 9 s budget.
7. Enable affected selection only after the queue is enforced. Use an intentionally missed real dependency to test failure detection. Unknown assets, dynamic reads and configuration changes must fall back to full coverage.
8. Enforce the requested job budgets after the jobs can meet them. Do not add unconditional short timeouts that make all current runs fail, or widen current limits to manufacture a pass.

## Account and spending decisions

GitHub's organization requirement is an ownership decision. For a public repository the queue itself does not require a private-repository Enterprise subscription. Verify the chosen organization's plan and permissions before transfer. A transfer can affect existing integrations, so it must be a separate approved action.

Blacksmith lists x64 2-vCPU runners at USD 0.004/min and 8-vCPU runners at USD 0.016/min. Its free allowance is 3,000 2-vCPU-equivalent minutes/month. Sticky disks are optional at USD 0.50/GB/month. [Standard GitHub runner compute for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions) currently costs USD 0; this is not a claim about all GitHub account charges.

Observed volume was 150 runs in 15.9306 hours, which extrapolates to about 6,779 runs in 30 days if that short burst continues. That is a scenario, not a monthly forecast. At eight 8-vCPU runner-minutes per run, that scenario would cost approximately USD 856/month after the stated compute allowance. At the unchanged observed completed-job minute rate, all on 8-vCPU Blacksmith runners, the scenario is approximately USD 4,239/month. Neither estimate includes sticky disks or assumes a measured Blacksmith speedup. Establish a spend cap and benchmark before a paid switch. No Blacksmith account, token, installation, or bill was created.
