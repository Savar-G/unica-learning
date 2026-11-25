# CI performance

CI uses a two-tier model while keeping the repository on personal account `Savar-G` (free public GitHub Actions runners):

- **Pull requests (fast feedback):** `.github/scripts/pr-scope.mjs` classifies each PR diff into `skip` (unreferenced docs/design-only), `affected` (`engine` when `src/lib/workbook-v2/**` changed, `pr-unit` running `vitest --changed` without engine tests plus explicit consumer tests for dynamically-read docs/assets, `lint-and-types` when code changed, and path-scoped `maya-behaviour`, `family-zones`, and `voice-worker`), or `full` (configs, CI, DB migrations, `data/`, `scripts/`, `public/`, core shared modules, >40 files, or unknown paths).
- **Workbook v2 engine (`engine`):** Runs on one machine with a shallow checkout, npm cache, required pinned Typst install, `npm run check:guard`, `npm run engine:typecheck` (`tsconfig.engine.json`), and `npm test -- src/lib/workbook-v2`, with no Chromium unpack, database, or network after the install steps. In both `full` and `affected` modes, `engine` owns all `src/lib/workbook-v2/**` tests (`unit` and `pr-unit` exclude them so they run once). A PR with more than 40 files stays in full mode, and the engine documents alone (or with app code) do not run `engine`. An engine-only PR skips `unit`, `scan-binding-scale`, `maya-behaviour`, `family-zones`, and `voice-worker`. Its `pr-unit` runs only the app tests that import the changed engine files, which Vitest finds (none today). A summary step (`.github/scripts/engine-summary.mjs`) always reports the engine test time against the 15 s budget apart from pass or fail, and never fails the job on a slow or missing time.
- **`main` push & release gate (full suite):** Every `push` to `main` and every `workflow_dispatch` runs the complete suite across 8 duration-balanced unit shards plus `engine` and all check jobs. Vercel's Deployment Check requires `main`'s `test` check to pass before promoting a build to production, so a cross-PR regression on `main` is held out of production until fixed forward.
- Do not retry tests, raise timeouts, or skip tests to meet a speed target.

## Measured progress (2026-11-19)

1. **PR #1187 (5 duration-balanced unit shards, parallel checks, workflow cleanup):**
   - Replaced 2 alphabetical shards with 5 Longest-Processing-Time shards (`.github/scripts/vitest-ci.config.mjs`, `.github/scripts/unit-shards.mjs`), dropped unused Postgres containers from unit shards, limited `fetch-depth: 0` to shard 1 (pinned to `workbook-book1-recovery.test.ts`), pre-unpacked `@sparticuz/chromium`, split serial `checks` into `family-zones`, `lint-and-types`, and `voice-worker`, and ran the 3 `maya-behaviour` files concurrently with `--maxWorkers=3`.
   - Observed PR feedback dropped from **17m 26s** median (40-run pre-change sample) to **7m 11s** (`unit (1/5)`–`(5/5)` 5m 08s–7m 06s; `lint-and-types` 1m 38s; `voice-worker` 1m 41s; `family-zones` 2m 05s; `maya-behaviour` 2m 07s).
2. **PR #1190 (shared Chromium engine, content-hashed AST import cache, split mega-suites):**
   - Added `sharedChromiumPrintEngine()` (tab reuse per test file), cached SHA-256-keyed AST imports in `scripts/scan-marking-physical-cli.ts` (`scan-marking-physical.test.ts` dropped from 262s CI to ~15s), deduplicated `realPages()` in `scan-binding-chromium`, fixed the O(N²) log-sizing loop in `historyLimitSeed`, and split `maya-text-log`, `maya/example-flow`, and `scan-binding-chromium` across parallel files while retaining 100% of existing cases, seeds, and assertions.
   - Top single-file CI ceiling dropped from **366.5s** (`maya-text-log.test.ts`) to **235.2s** (`scan-binding-scale-chromium.test.ts`); `unit (5/5)` finished in **4m 37s** and `unit-timings.json` was refreshed from green run `44682556546` to rebalance all 5 shards.
3. **PR #1191 (two-tier PR selection):**
   - Added `scope` + `pr-unit` (`vitest --changed` + explicit consumer tests for dynamically-read docs/assets) for fast PR feedback while preserving the full 5-shard gate on `main` pushes and high-blast-radius PRs. If the repository later moves to a GitHub Organization, adding `merge_group:` to `ci.yml` upgrades this cleanly to an enforced merge queue.
4. **PR #1192 (Oxlint on scoped PRs):**
   - Added `oxlint` (`1.94.0`) with `.oxlintrc.json` mapping **80 of 86** active ESLint rules from `eslint.config.mjs` (2 unmapped rules are obsolete in the React 19 automatic JSX runtime: `react/jsx-uses-react`, `react/jsx-uses-vars`; 4 real ESLint-only rules remain: `@next/next/no-location-assign-relative-destination`, `react-hooks/config`, `react-hooks/gating`, `react/no-deprecated`).
   - `lint-and-types` runs `npx oxlint src` (~1 s locally vs ~38 s local / ~56 s CI for ESLint) on every code PR and `main`, and runs `npx eslint src` on `mode == 'full'` (`main` pushes, `workflow_dispatch`, and high-blast-radius PRs including `.oxlintrc.json` / `eslint.config.mjs` edits) so none of the 4 ESLint-only rules lose enforcement. Also added `npm run lint:fast`.
5. **PR #1194 (local pre-push gate & CI duration budgets):**
   - Added `.githooks/pre-push` + `scripts/pre-push-check.mjs` (`npm run hooks:install`, `npm run check:fast`), which runs `oxlint src`, `next typegen && tsgo --noEmit`, and `tsgo -p worker/maya-voice/tsconfig.json` in parallel using direct `node_modules/.bin` binaries (~5.3–5.8 s warm wall clock on macOS arm64, skipping remote ref-deletion-only pushes).
   - Right-sized `timeout-minutes` across all 8 CI jobs and key steps based on post-PR-#1187/#1190/#1191/#1192 green Linux durations.
6. **8 duration-balanced unit shards & top outlier splits (this change):**
   - Evaluated selective Vitest `isolate: false` on 76 pure `src/lib/**` subdir files (`--sequence.shuffle --sequence.seed=17 --maxWorkers=4`): `isolate=true` took **68.07 s** (`import 13.93 s`, `tests 150.99 s`) vs `isolate=false` **65.28 s** (`import 11.10 s`, `tests 159.31 s`) — only a ~4% wall-clock delta because >90% of unit wall time is test CPU work, not module isolation. Retained `isolate: true` across the entire suite.
   - Instead split the two remaining >180 s single-file ceilings (`src/lib/scan-binding-scale-chromium.test.ts` → `+ src/lib/scan-binding-qr-chromium.test.ts`; `src/lib/maya/first-ship-practice.test.ts` → `+ src/lib/maya/first-ship-practice-tone.test.ts`, keeping 100% of existing cases, seeds, and assertions) and scaled `unit` from 5 → 8 duration-balanced shards (12 concurrent jobs total, within GitHub's 20-job free concurrency cap for public repos), cutting the single-file ceiling from **235.2 s → 157.2 s** and targeting ~3.5–4.5 min full `main` CI wall time.

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

## The Maya gate's timing budget: 2026-11-17

The gate's own work is the cost of `src/lib/maya-gate` in the unit shard, and it was budgeted as one number for the whole block: `ms < 30_000` over 564 behaviours. That number measured the runner, not the gate. Over the 19 first attempts read for this change (15 successful runs, and the four re-runs for this test whose logs still exist), the block took 15,748 to 36,755 ms of wall clock, median 20,605 ms, so 28 to 65 ms a behaviour. The four failing runs measured 30,094, 30,224 and 30,296 ms against the assertion, and one took 36,755 ms: 1.5x the median, not a regression. The 36,755 ms run also spent 53.2 s of CPU time where the median run spent 28.9 s, for the same work, so the spread is machine speed and not queued work.

The test now budgets each behaviour: `ms / BEHAVIOURS.length < 150` ms, four times the 36 ms median. A behaviour added to the gate no longer spends the budget, and a gate made ten times slower measures about 360 ms a behaviour, which fails with the measurement in the message ("332 ms a behaviour, over 564: expected 332 to be less than 150" when a 300 ms spin was put in `runBehaviour`). The hook that wraps the block is now 240 s and is a hang guard, not the speed gate, so a budget failure reports the number instead of a hook timeout. The test logs `perBehaviourMs` beside `wallMs` and `cpuMs` on CI; read that line before moving this budget.

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
