# Workbook failure recovery (#1114)

This change preserves actionable run failures and repairs missing content, teaching methods and page fit in synthetic U10/U19 books. It uses the saved provider choice and keeps the existing instructions, quality limits and approval rules. Branding #1112 has a separate audit PR.

## Current verification

The local full-book probes use fixed seed `17fc5da1-2442-488a-a450-611a471e73e6`, fake AI and `--no-store`. The older failed trials below explain the repairs; they are not the latest status.

| Check | Latest result | Evidence folder |
|---|---|---|
| Full U10 catch-up with requested settings | 84 pages / 627 questions; no failures or omissions | `/tmp/ui-review/workbook-failure-u10-catchup-round8` |
| Full synthetic U19 with the three requested review choices | 64 pages / 499 questions; no failures or omissions | `/tmp/ui-review/workbook-failure-u19-full-round8` |
| Full standard U16 baseline | 84 pages / 597 questions; no failures or omissions | `/tmp/ui-review/workbook-failure-baselines-full-round8` |
| Full U4 after label repair | 84 pages / 625 questions; no failures or omissions | `/tmp/ui-review/workbook-failure-u4-full-round10` |
| Automatic version of the U19 synthetic profile | U16, 84 pages / 588 questions; no failures or omissions | `/tmp/ui-review/workbook-failure-automatic-full-round10` |
| Provider/job recovery tests | 305 focused cases pass | `/tmp/workbook-failure-final-focused.log` |
| Generator/content regression checkpoint | 46 cases pass; typecheck passes | `/tmp/workbook-round8-final-focused.log` |
| Coupled Review/Spot label and U19 alignment checks | 12 physical cases pass; typecheck passes | `/tmp/workbook-round9-layout-focused.log`, `/tmp/workbook-round9-typecheck-fixed.log` |
| Final real U4 replay | Exit 0; 28 pages / 248 questions; code-only, no model calls | `/tmp/ui-review/workbook-failure-final-real-u4-round10` |
| Final real U16 replay | Exit 1; test CLI subscription quota; zero API fallback | `/tmp/ui-review/workbook-failure-final-real-u16-round10` |
| Full-suite checkpoint | 930 files / 29,847 tests pass; two reference expectations failed and were refreshed through public interfaces; focused reruns pass | `/tmp/workbook-final-gate-tests.log`, `/tmp/workbook-final-reference-refresh.log`, `/tmp/workbook-final-reference-fixed.log` |
| Final lint/build | Both exit 0 after the reference refresh | `/tmp/workbook-final-gate-eslint.log`, `/tmp/workbook-final-gate-build.log` |

The U19 fixture has school grade 4 and automatic placement U16, unlike the historical family's U18 placement. It supplies all three requested review choices, but the planner declines 5.15 for that fixture's grade. These are local probes, not proof of an exact historical replay or authorization to regenerate either family book.

### Production availability check

A read-only check on Nov 15 confirmed that the Mac worker was online and idle on build `d1f7c409021a21b4ac4486f8275921bb484d9b33`. The latest recorded subscription attempt, at Nov 14 18:28 Pacific, used `codex/gpt-6.1-sol;reasoning=high;auth=chatgpt` and was unavailable because of its usage limit. Earlier Codex calls did answer. The heartbeat proves the worker process is online, not that its subscription allowance has recovered. No live run, account selection or provider setting was changed. The local Claude test quota is a separate limitation and establishes no production Codex reset time.

### Reference expectations after the content repair

The full suite reached 930 passing files and 29,847 passing tests with two failed reference expectations. U4's Maya coverage reselected one story question as a bare question; accepted-question and operation counts did not change. The focused generator test refreshed only those two snapshot counters and retained its printed-input and operation assertions.

The fixed current-curriculum preview intentionally refuses a changed curriculum fingerprint. Its synthetic book, prospective baseline, print contract, 52 right-answer marks and saved preview were rebuilt through the public job and preview interfaces. Replay still advances with all 52 consumed versions. The historical version-1 replay and changed-curriculum refusal fixtures were preserved. The 27 Maya tests and all three fixed-preview tests pass. This reference refresh does not turn the earlier full-suite failure into a green full-suite result.

## Planning failures keep their real cause

`prepareWorkbookCapacity` raises `CapacityProblem` when a deterministic plan cannot fit. Previously the job recorded that error and immediately retried. No frame had been saved, and the error history itself counted as stored work, so the retry replaced the fit failure with “no stored plan”.

The job now ends that attempt with the original capacity error. The guard against re-planning over stored work is unchanged. Transient failures retain the existing retry path.

## A lasting provider outage stops the run

The fallback client distinguishes exhausted/unavailable providers with `WorkbookAiUnavailable`. A lasting failure with no fallback, or a restored gate with no usable provider, propagates through the writer and independent solve check to the job. It fails the run without rendering or storing an incomplete draft. Existing per-provider usage/exclusion logging and all already-saved work remain intact.

A temporary subscription-process crash remains retryable. An available, already-configured fallback still works. No provider is enabled, changed or given a new budget by this patch. Single-dispatch edit behavior is unchanged.

The admin's collapsed AI section shows unavailable attempts and missing results instead of “No AI calls logged yet”. Subscription labels no longer incorrectly identify every subscription as Claude; the saved model and outage reason retain the actual provider information.

## Regression evidence

- Five new cases first failed on the previous behavior: capacity error masking, unavailable writer, unavailable solver, restored provider outage, and the misleading admin summary.
- The focused job/generator/fallback/workbook-AI/solve-check/admin suites pass 305 tests, including temporary-crash recovery, mixed temporary/permanent provider failures, concurrent fallback exclusion, outage during an incomplete-response retry, and waiting for sibling quality-gate persistence before an outage escapes.
- Tests use public interfaces, synthetic data, in-memory stores and fake providers. No customer generation was restarted and no paid request was made for these tests.
- Local logs: `/tmp/workbook-failure-red.log`, `/tmp/workbook-failure-focused.log`.

Independent review found two P2 edge cases: the last fallback's lasting failure could hide a still-retryable primary, and a solver rejection could escape before a sibling quality gate saved. Both now have regressions that failed before their repair (`/tmp/workbook-failure-review-red.log`) and pass afterward (`/tmp/workbook-failure-review-focused.log`). The initial full-suite attempt was stopped as obsolete after these findings; it is incomplete, not a pass.

A fresh review confirmed those repairs and found a concurrent version of the first problem: a sibling could exclude the fallback after the call took its initial provider snapshot. The final loop exit now rechecks current eligibility too. Both provider orders failed the new regression before the one-line repair (`/tmp/workbook-failure-race-red.log`) and pass in the final 305-test focused run (`/tmp/workbook-failure-final-focused.log`).

## Initial layout failures

Seed `17fc5da1-2442-488a-a450-611a471e73e6`, fake AI, no-store, strict Chromium fit checks:

- A synthetic U19 first-book plan with the requested start/teach-more/review selections reproduces **Day 5 page 4, on-your-own, 25px overflow** before any writer call. The reduced-days sample numbers it page 12. Its synthetic profile is not the customer's frozen profile; review-selection outcomes are therefore not identical.
- A diagnostic fit capture shows five missing approved question contracts in that page's on-your-own block. Spacing its failure placeholders eventually overflows. Hiding placeholders, inventing stand-ins for missing contracts or loosening the fit check would not repair the missing required content. Routing/contract availability still needs its own fix and regression.
- A synthetic U10 catch-up plan confirms review 2.4 applies and teach-more 3.3 is deferred for prerequisites/space. With an answering fake writer, its Day 8 practice page still fails occupied-height fullness (83%). This is a local reproduction, not proof that the historical customer draft is repaired.
- Baseline outputs: `/tmp/ui-review/workbook-failure-u19-before`, `/tmp/ui-review/workbook-failure-u10-before`; detailed synthetic U19 measurements: `/tmp/ui-review/workbook-failure-capture/history.json`.

Issue #1114 stays open. Existing incomplete drafts are not made approvable by this patch. The approved paid API rerun for #936 is a separate test authorization, not permission to bypass failed content or print checks.

## Local repair round, Nov 15

The U10 regression first failed because final spacing was tuned only for writer-built questions, not a writer-built example beside code questions. The final check now applies the existing bounded spacing retry to that example case too. Regressions retain failures when all permitted gaps still fail fullness or when widening the gap causes overflow. No question is removed to pass these tests.

- The reduced synthetic catch-up book with the requested review passes all strict checks: 28 pages, 204 questions. Output: `/tmp/ui-review/workbook-failure-u10-layout-fix`.
- The full seeded synthetic catch-up book also passes: 84 pages, 627 questions, zero failed questions, fit failures, omissions or render problems. Output: `/tmp/ui-review/workbook-failure-u10-full-fixed`; log: `/tmp/workbook-failure-u10-full-fixed.log`. These synthetic counts do not describe the historical customer's frozen book.
- U19's angle practice exhausted usable distinct tasks after examples and earlier teaching. Three existing prompts have shorter wording with the same fields and keys, and two normal practice forms check the same definitions. Worked examples compare openings with a square corner. Tests cover checked contracts, distinct tasks, own-step coverage, unchanged rewrite keys and 200 seeds of the added forms.
- The reduced strict U19 custom sample now gets past Day 5 page 4 and has zero failed questions, but it is **not ready**: six other pages fail, and four questions are dropped. Remaining findings include new-idea answer alignment, inconsistent Challenge number fonts/label gaps, below-mastery review, Challenge selection from the wrong step, repeated compact angle reminders and lost planned questions. The compact reminder repetition appeared with the new conceptual methods and remains unresolved. Output: `/tmp/ui-review/workbook-failure-u19-layout-fix`; log: `/tmp/workbook-failure-u19-layout-fix.log`.
- Forty tests in eight touched/related suites pass in `/tmp/workbook-failure-layout-all-focused.log`. The subsequently added 200-seed practice test still needs its next run. No full gate has been claimed for these uncommitted layout/content changes.

The no-op-fit regression isolates question selection; it does not prove physical fit. The full U19 check, automatic-plan comparison, changed-page review, final real pair, final gate and independent review remain pending. No customer run has been restarted, and no existing print contract has been regenerated.

### Follow-up checks and repairs

Independent standards/spec reviews of snapshot `2611b829ab1b1c2c127013fcc7e6e19f8bd17d1c62ec3d1807ae135761db7791` found a compact-reminder collision and a cross-level method regression: triangle classification could accidentally receive the new opening-only rule. Regressions failed on both. The method now requires the trusted `6.13-classify-angles` skill; compact word-answer examples retain their distinct question alongside the method. Tests also cover both the three applied-review choices and all four requested choices, with bounded counting fit rather than claiming physical fit.

Real Chromium regressions reproduced the Try this first alignment and mixed Challenge-number font failures before their CSS repairs. Those three physical cases now pass. The reduced U19 round-2 sample passes the original overflow, answer alignment, number fonts and reminder-repeat checks; three pages still fail. Its outputs and changed-page sheet are in `/tmp/ui-review/workbook-failure-u19-layout-round2`.

The next round removes the earlier-step Challenge borrowing path, which contradicted the unchanged hardest-step gate. It supplies three hard checked templates on each of the three steps exercised by the reduced sample: prime/composite step 1, angle classification step 1 and divisibility step 3. The added keys are checked independently over 200 seeds. Generic arithmetic builders can no longer stand in for a mastery-step review, while fluency facts retain their own path. Bounded contract tests pass with those restrictions.

Reduced strict round 3 has zero failed questions, zero render problems and two remaining coverage failures. Pages 8 and 14 lost planned Challenge cards during capacity planning. No other whole-book issues are reported in that selected sample. Output: `/tmp/ui-review/workbook-failure-u19-content-round3`. Full U19 remains pending; the new Challenge content is not yet sample-approved.

The earlier U4/U16 fake regression round passed with zero changed pages against its baseline, in `/tmp/ui-review/workbook-failure-layout-regression`. That run predates the latest CSS and Challenge/mastery repairs and does not verify them. Route/type generation and TypeScript pass after removing the generated development validator that still named the deleted temporary QA page; touched-file lint passes. The latest complete diff still needs the final gate and review before any push.

### Current checkpoint

Round 4 replaces the angle Challenge's arithmetic-count prototypes with checked qualitative reasoning about arm length and opening, and shortens the prime-card story without changing its numbers or key. The printed card count and work-space rules are unchanged. The current five focused suites pass 23 tests in `/tmp/workbook-u19-reasoning-all-focused.log`.

The targeted strict U19 sample is now ready: **24 pages, 218 questions, zero failed questions, fit failures, render problems, dropped questions or omissions**. Output: `/tmp/ui-review/workbook-failure-u19-reasoning-round4`; log: `/tmp/workbook-failure-u19-reasoning-round4.log`. It covers Days 1, 5 and 10 with the three applied-review choices. The synthetic profile still differs from the customer's historical profile and declines review 5.15 because of its school grade; this is not proof of exact customer reproduction.

The next full ten-day fake/no-store sample **fails during planning** at Day 2 page 6, the unit-check slot overflowing by 5 px. No draft is produced, and the actionable capacity error is retained. Output: `/tmp/ui-review/workbook-failure-u19-full-round4`; log: `/tmp/workbook-failure-u19-full-round4.log`. A local unshipped bootstrap awaits the unchanged CLI module and then exits with its actual `process.exitCode`, avoiding the known unrelated lingering handles after completion. The full custom book is not ready, and no successful final gate or real-AI verification is claimed for this checkpoint.

## Review repairs after the full-book checkpoint

The requirements review found too few own-step Challenge contracts on divisibility steps 1 and 2, and a step 3 interval with only one integer candidate. Each deficient step now has three checked hard forms. All three interval forms have multiple integer candidates and exactly one qualifying answer; independent enumeration tests cover 200 seeds. The original curriculum files remain unchanged.

A bounded selection diagnostic then exposed two additional causes of missing or repeated cards: the previous/next-multiple prompts normalized to the same card frame, and capacity shortening could replace a card with a template already used beside it. The prompts now have distinct printed forms, and refitting, shortening and refilling preserve the planner's once-per-Challenge-template limit. The existing frame and task checks remain binding. The diagnostic is local; the public-interface regressions are committed with the repair.

Focused validation: `workbook-generator-custom-capacity.test.ts` and `workbook-curriculum/house-templates.test.ts` passed all 17 then-present tests (`/tmp/workbook-review-contracts-round5b.log`). This includes Day 2 and Day 6, both applied/requested review sets and compact reminders. An additional all-ten-day contract test and the current full strict sample remain pending.

The captured earlier Day 2 page is not a basis for relaxing fullness or adding fine spacing retries: it still had a missing third approved Challenge contract. Its largest unoccupied interval was 64 px at zero extra gap, grew as extra spacing increased, and overflowed by 19 px at 48 px extra gap. Recheck complete content before changing layout. Capture: `/tmp/ui-review/workbook-u19-day2-capacity/history.json`.

The all-ten-day contract regression then reproduced the same coverage gap on later prime, common-multiple and angle steps, plus the consecutive divisibility-step-3 days. Those steps now have checked hard forms of their own. Step 3 has six distinct forms so Day 10 need not repeat Day 9's frames. The tests also exposed a mock-only Day 5 omission: its arbitrary ten-question ceiling was below the combined Friday/check/Challenge count. The full-book contract seam now permits fourteen questions on page 6; it remains a counting test, not evidence of physical fit.

Current focused result: **3 suites, 25 tests passed** (`/tmp/workbook-u19-complete-coverage-round5c.log`), including all ten days with three distinct, hard own-step Challenge contracts and the straight/reflex teaching methods. The subsequent strict full sample still fails during planning on **Day 3 page 5**, 25 px overflow in on-your-own. No draft is produced. Log: `/tmp/workbook-failure-u19-full-round6.log`. That page's retained contracts and measurements are being captured before any layout repair. No full-book readiness is claimed.

Day 3's captured failure proved to be missing content, not a 25 px spacing mismatch: five on-your-own slots lacked approved contracts. Their failure messages were what eventually overflowed. The original common-multiple practice pool had exhausted its distinct tasks. Added source-bounded normal forms and an explicit list-of-multiples teaching method address that cause. Extending the ten-day regression to every non-writer slot then found the same five-contract shortage on Day 8; additional straight/reflex practice forms address it.

Latest focused result: **3 suites, 30 tests passed** (`/tmp/workbook-u19-all-contracts-focused.log`). Every non-writer question in the full synthetic plan now has an approved contract, and every day retains three distinct hard own-step Challenge contracts. This is still a bounded counting seam. The new full strict sample with output/diff is running at `/tmp/ui-review/workbook-failure-u19-full-round7`; final gate and real verification remain pending.

The round-7 full U19 run completed successfully: **64 pages, 499 questions, ready=true, zero failed questions, fit failures, dropped/omitted questions or render problems**. It used fake AI, no storage and the fixed sample ID. Full output, text dump and changed-page comparison: `/tmp/ui-review/workbook-failure-u19-full-round7`; log `/tmp/workbook-failure-u19-full-round7.log`. It passed planning and the final strict renderer, but the independent reviews still found content defects.

The requirements review found an LCM count prompt that read like a request for a list. It now explicitly says “Count positive multiples”. Both reviewers found that the opening-only angle method also admitted degree-based step 3. The method now receives a trusted skill-and-step pair and admits only steps 1/2; degree-based classification and composition regressions remain outside it. The standards review also caught a real printed reminder teaching the hidden constructor `k + 1` instead of the angle count. That form now explains which angle class to count, and the compact reminder retains the actual question, including numeric-count examples. Regressions check the generated teaching block and both angle-count steps. **3 suites / 34 tests pass** (`/tmp/workbook-round7-review-repairs-focused.log`). The round-7 PDF predates these repairs and is not an approval candidate.

The full U10 regression then failed at Day 5's estimate new-idea page: its three planned two-column practice cells could not gain a fourth within the day time limit, and losing one would violate its three-question floor. The existing complete-pair reservation for estimate step 3 now also covers step 2, before time trimming or optional fill. No minimum or time threshold changed. The new public-plan regression fails before the fix; the U10 Challenge, grid-fallback and writer-example suites then pass **16 tests** (`/tmp/workbook-u10-pairs-focused.log`). Full U10 round 8 is running; later strict U19, baseline regressions and the final gate remain pending.

The U10 first-customer variation completed generation and strict output with **84 pages / 621 checked questions**, ready=true and no manifest warnings; its CLI then exited 1 because the requested comparison folder contained the catch-up label, not first-customer. Its saved PDF/draft are additional evidence, not a clean successful CLI comparison (`/tmp/ui-review/workbook-failure-u10-full-round8`). Re-running the original catch-up fixture against its matching baseline completed with exit 0: **84 pages / 627 questions**, ready=true, no failed, fit, render, dropped or omitted items (`/tmp/ui-review/workbook-failure-u10-catchup-round8`, `/tmp/workbook-failure-u10-catchup-round8.log`). The diff marks all 84 pages for the shared template CSS input; question counts remain the same.

The method scope also excludes step-2 turn-composition Challenge forms from the opening-only worked method; those require fuller reasoning. The once-per-template restriction remains conditional on a step having at least three eligible forms, preserving earlier-level numeric variation. The U19 repaired steps all have three or more forms, so their three distinct-form regression stays binding. Final targeted tests/typecheck and a fresh U19 strict output are pending at this checkpoint.

U19 round 8 completes cleanly after the review repairs: **64 pages / 499 questions**, ready=true, with zero failed, fit, render, dropped or omitted items (`/tmp/ui-review/workbook-failure-u19-full-round8`, `/tmp/workbook-failure-u19-full-round8.log`). Only pages **31, 44, 47 and 49** changed against the preceding full sample. The changed sheet and page 31 confirm that the actual count question and its concept method print, rather than the hidden sampling addition. The prompt on page 44 explicitly requests a count. The latest focused checkpoint passed **46 tests across 5 suites**, followed by `npm run typecheck` (`/tmp/workbook-round8-final-focused.log`, `/tmp/workbook-round8-typecheck.log`).

Full baseline checks then found one U4 layout failure on Day 8 page 4: the internal Review label has a 10 px gap above it while the review rows are 16 px apart. No questions failed or dropped. U16 passes its full baseline: **84 pages / 597 questions**, zero failed, fit, render, dropped or omitted items. Baseline folder/log: `/tmp/ui-review/workbook-failure-baselines-full-round8`, `/tmp/workbook-failure-baselines-full-round8.log`. The chained automatic-persona comparison did not start because the U4 failure made the baseline command exit 1. The label spacing is being repaired through the unchanged strict template check before the U4 rerun and automatic comparison.

The first label repair removed the U4 Day-8 crowding but produced inconsistent Review/Spot gaps on Days 4 and 6. The final rule aligns both: the early practice block uses its 12 px row gap internally, the Review label adds its existing 4 px margin, and the next section starts 16 px after the preceding block. Both gaps grow with the same extra-gap value. Nine split/gap combinations plus the three U19 alignment cases pass through the strict public template check. The fixture also keeps all nine questions. Full U4 then passes **84 pages / 625 questions**, with zero failed, fit, render, dropped or omitted items (`/tmp/ui-review/workbook-failure-u4-full-round10`, `/tmp/workbook-failure-u4-full-round10.log`). This selector applies only to the early band, not the U10/U16/U19 samples.

### Automatic comparison

The same anonymous first-customer profile, school grade 4, code and seed produce automatic **U16, 84 pages / 588 questions**, with zero failed, fit, render, dropped or omitted items (`/tmp/ui-review/workbook-failure-automatic-full-round10`, `/tmp/workbook-failure-automatic-full-round10.log`). Supplying the requested U19 start level and teach-more/review choices produces **U19, 64 pages / 499 questions**, also clean (`/tmp/ui-review/workbook-failure-u19-full-round8`). Customization was kept throughout the repair. This comparison checks both local paths; the fixture's declined 5.15 and different automatic level remain limits on historical reproduction.

### Final replay pair and independent review

The one final pair ran in parallel with API key variables removed, `--subscription-only`, `--no-store` and the previous real replay folders. **U4 exits 0**: 28 pages / 248 questions, no failed/fit/render/dropped/omitted items, no provider calls. **U16 exits 1**: the standard test CLI's Claude account refuses its weekly allowance, reporting Nov 18 at 4pm America/Vancouver. It supplies no usable response and the API fallback remains off. Logs: `/tmp/workbook-failure-final-real-u4-round10.log`, `/tmp/workbook-failure-final-real-u16-round10.log`. This test-account message does not establish the production worker's separate Codex reset time. No provider configuration or family run changed.

Both final review axes report no new actionable defects on BASE `8db3058` through HEAD `aafbefe` plus supplemental snapshot SHA-256 `667373d10f0ba1684e2e8296d25f38680550773212d5171d4f0523c7eeabbf5a`. They read the U19 printed text and four-page comparison. That review establishes neither real-AI wording nor sample approval. The full test/lint/build gate is running; exact historical-family replay and Savar's approval remain acceptance work.

## Release checks

- `npm run workbook:fast`: fake U4 and U16 days 1,5,10 each pass strict checks with zero failed questions, fit failures, omissions or render problems. U4 has 249 questions; U16 has 199. Output: `/tmp/ui-review/workbook-failure-regression`.
- The subscription-only pair was attempted with all API key variables removed. U4's code-only output reports ready (248 questions; no provider calls). U16 fails before a usable answer with a subscription-login refusal, rather than continuing into blank questions. The configured identity differs from the CLI's default Keychain identity: default `claude auth status` is logged in, but setting `CLAUDE_CONFIG_DIR=/Users/cedrictanafranca/.claude` reports logged out. This is an environment/configuration limitation, not proof that real U16 wording passes.
- Both sample child processes remained idle after logging `done`; only those completed, stalled children were terminated, with all logs/output retained. Therefore the attempted pair does not have clean successful exit evidence. No API fallback was enabled. Logs: `/tmp/workbook-failure-real-u4.log`, `/tmp/workbook-failure-real-u16.log`.
- Round 2 used the same default logged-in account without the explicit configuration override. A temporary local bootstrap awaited the unchanged sample entry module and exited with its final exit code after all output/browser cleanup, avoiding unrelated lingering handles. It is not shipped. Both samples used replay folders (there were no prior successful model responses to reuse). U4 exits 0, passes all checks, and has **zero changed pages** against the preceding U4 output. U16 exits 1 with the account's weekly usage-limit refusal (reported reset: Nov 18, 4pm America/Vancouver); no usable writer answer or API fallback. Logs/output: `/tmp/workbook-failure-round2-u4.log`, `/tmp/workbook-failure-round2-u16.log`, `/tmp/ui-review/workbook-failure-round2-u4`, `/tmp/ui-review/workbook-failure-round2-u16`. This does not establish a reset time for the Mac worker's separate Codex account.
- Aside browser QA on a temporary synthetic local route passed at 390px and 1280px: the failed run preserves its quota reason, the closed AI section says unavailable, expanded details show the selected provider without calling it Claude, and there is no horizontal overflow. The route was removed, the owned tab closed and the dev server stopped. Evidence: `/Users/cedrictanafranca/.aside/u/0/sessions/2026-11-15_50P4oRa7BDfYQzwM/artifacts/`.

The full gate, successful real sample/replay evidence, browser check and independent review must be recorded before this slice is ready to merge. Generator sample approval remains with Savar under `docs/workbook-rounds.md`.
