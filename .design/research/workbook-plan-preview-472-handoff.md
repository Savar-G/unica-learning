# Bounded #472 public plan preview

HANDOFF_DONE: bounded pure public plan-preview implementation accepted by the root.

The public preview now composes the approved progress core with the existing public planner. This accepts no customer, recognition, printed-page, or release outcome. Whole #472 and the remaining #475 UI and transport proof stay open.

## Exact source

- Computer: `Savars-MacBook-Pro-5.local`, checked with `hostname`.
- Actual model: `gpt-6.1-sol`, high reasoning effort. The task specified Unify Codex. No account or credential file was read.
- Assigned path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-9e21d692`.
- Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-9e21d692`, checked with `pwd`.
- Branch: `site/workbook-plan-preview-472-9e21d692`, checked with `git branch --show-current`.
- Exact feature base: `051215dfcff447a3ebe85762a9b2e5a029c18f6b`.
- Exact implementation head: `6fa34174d883873737d55263de45e1556b9d880a`.
- This file is added in a subsequent report-only commit. The final response gives the delivery HEAD that includes this report.
- The feature base contains the approved source repair `14cd5144cf2f6834193d1b71133a8fe8eaa10980` and its supplied review reports. Their earlier 94 tests and 471 probes are prior core evidence. This task did not rerun or replace that review.
- Actual merged #697 foundation: `89963c956d5eee2b87d18c58e9c35181b9aeef7f`.

The assigned checkout started clean at `550fdcf1619c0e515e8ac33e2a65869d8c937af7`. The permitted fast-forward reached the exact feature base. Only this checkout's branch was renamed. No newer main was fetched or imported. The task reported the PC freshly unreachable. No PC work or subagent was started.

Changed files:

- `src/lib/workbook-plan.ts`: optional versioned policy, policy validation, target consumption, and opt-in metadata.
- `src/lib/workbook-progress-plan.ts`: new public pure preview.
- `src/lib/workbook-progress-plan.test.ts`: public preview and fixed-base tests.
- `src/lib/workbook-progress-plan.fixture.ts`: one new shared synthetic fixture file for the tests and the pre-edit baseline.
- `.design/research/workbook-plan-preview-472-handoff.md`: this report.

The approved core, its tests, both supplied independent review reports, and all other existing source and test files remain unchanged. No generator, curriculum, template, package, render, snapshot, decision, configuration, migration, or instruction file changed.

## Public contracts

`previewNextWorkbookPlan(input: WorkbookPlanPreviewInput)` accepts one object with `version: 1`, `snapshot`, `curriculum`, `history`, and `planning`.

- `snapshot` and `history` use the approved core contracts.
- `curriculum` extends `ProgressCurriculum` with the full frozen `CurriculumSkill`. The skill's level, delivery, pages, prerequisites, and step page budgets must agree with the supplied planning level and the BC skill map. Snapshot and curriculum versions must agree through the core.
- `planning` is ordinary validated `PlanInput` without `progress`. Its selected skill passed count is the prior proven prefix, not the newly derived count. It must agree with `snapshot.priorMastery.passedSteps`. An absent selected key means zero.
- The full `reviews` and `missedReviews` arrays must agree between the snapshot and planning input, including their order. A disagreement refuses the preview. This module creates no review schedule.

A successful result includes:

- Preview version 1 and exact snapshot, history, progress, and planning decision versions.
- Snapshot ID, cutoff, curriculum version, explicit scope, and prior mastery reference.
- The full core decision and the exact `planningInput` consumed by `planWorkbook`.
- The actual `WorkbookPlan` returned by that public planner.
- Used canonical keys with first and effective result versions.
- Held unfinished item states and deferred originals when no sample exists.

A refusal has a bounded reason and no plan, decision, answer text, or arbitrary planner error. Unsupported policies also have a bounded `policy` value. A `mastery-gap` result remains a refusal.

`PlanInput.progress?: ProgressPlanInput` and `WorkbookPlan.progress?` are versioned opt-in fields. The directive contains the approved decision version, snapshot/cutoff/curriculum, selection, target, action/reason/status, passed projection, representation request, repeat increment, parent follow-up, and focused-practice intent. The input also contains the prior proven prefix. The planner validates the relationships before use. Its output adds `checkWork` and actual selected-skill `teachingDays`.

These fields describe planning intent. They do not mean that a new representation or template was selected, a routine was rendered, a focused page was made, a Maya call was scheduled, or a parent was contacted. No current generator or renderer calls this preview path.

## Policy choices

- The existing step planner normally starts the next step of an available skill on a later teaching day. Changing only `passed` cannot express retention or regression.
- For repeat-new-numbers, repeat-check-work, regress-represent, retain-review, retain-unfinished, and change-approach, the planner substitutes the explicit target for the selected skill's remaining teaching queue. Each later teaching occurrence of that skill uses the same target. The target stays available in the existing skill window. Its first occurrence starts a New idea; later occurrences consolidate without another new-step start.
- Retained work does not unlock dependent skills after its first teaching day. Other skills continue through the existing prerequisite rules, skill window, page shapes, and counts.
- Regression keeps the proven passed prefix unchanged, including zero and a prefix above the regression target. It revisits the explicit target rather than reducing mastery.
- Advance requires the core target to be exactly one above the resulting proven prefix. Normal later within-book progression remains in effect for advance. Skill completion requires the final step and the full proven prefix; that skill has no remaining teaching queue.
- A non-complete selected skill cannot enter a level test solely because `workbook.inLevel` is large. Skill completion leaves the existing level-test policy in place. Legacy inputs keep the original policy.
- The planner must actually schedule the target for each action other than skill completion. Otherwise the preview refuses. It does not return a successful unused action.
- The selected printed step is available to personal review ownership checks. Thus a known miss can remain in the existing Fix it box before that step's new teaching day. This does not create passed mastery.
- The core supplies selected-skill accuracy and unresolved misses. A successful second try removes the corresponding miss without improving original accuracy. A parent original adjudication can change effective original accuracy, as the approved core defines. The first reading and its provenance remain available.
- Miss composition replaces only selected-skill originals represented in the frozen sample. Other skills' misses, and selected-skill misses outside that sample, remain intact. A caller miss that names a represented original must name the same question. Fix it uses the original question and first event for avoidance.
- With no required sample, all prior caller misses remain. Deferred readings stay in held evidence. No denominator, original question reference, mastery, or repeat issuance is invented.
- Other skills' passed values and both full saved review arrays pass through. Existing planner eligibility and capacity rules still govern their placement. This adds no #473 review calculator.
- The module reads no clock, environment, network, store, model, or image. It writes no state. Its successful result has no shared object with caller input.

## Unsupported cases

- `progression: "units"`: `unsupported-plan-policy`, policy `unit-progression`. This slice establishes retention only in the public sequential step planner.
- Non-`new-step` selected delivery: refused. Activity, parent-checked, and warm-up policy need a separate contract. The core can refuse a skill without a valid step sample before this delivery check.
- Remedial selected work above the school grade without a secure standard: policy `school-scope`.
- A core advance whose next target is already inside a higher proven prefix: policy `advance-with-higher-prefix`. The preview preserves the prefix and refuses instead of teaching a contradictory target or erasing proof.
- A valid target outside the available teaching window, or blocked by prerequisites: policy `target-not-scheduled`. A positive control proves the same target works when its prerequisite has an explicit passed prefix.
- Malformed contracts, unknown versions, foreign identities, curriculum/context/result mismatches, mastery gaps, and inconsistent caller scope, review, miss, or prior mastery inputs: bounded refusal.
- Existing ordinary planner failures: `planner-refused`. Arbitrary planner error text is not returned.

## Baseline and checks

Falsifiers stated before checks: changed legacy bytes; selected-skill teaching outside the target; lost other-skill inputs; fixed originals left in Fix it; or a successful action that the actual plan ignores. Additional controls check the level-count shortcut, parent-original versus later-fix behavior, prerequisite ownership, malformed inputs, and caller mutation.

Before the planner edit, the public planner produced 20 successful synthetic baseline results: U4 and U16, both step and unit progression, with plain, personal, review, Fix it, and complete-level inputs. Full inputs and results were saved to `/tmp/workbook-plan-preview-472-baseline.json`.

- Saved baseline size: 1,187,796 bytes.
- SHA-256: `fe1476705042bf2a2e1571bcd4448bcb913d110ce6b308c1be6ffdf8ef287a0a`.
- Final comparison: all 20 serialized results exactly equal the saved pre-edit bytes. No legacy result has a `progress` property.
- The root replaced the Git-dependent committed test setup with fixed SHA256 pairs for each baseline input and full result. The pre-edit 20-case artifact was independently verified against its saved SHA256 before those pairs were written. Committed tests now compare every full input/result hash and the complete 20-case name distribution without Git or esbuild. Explicitly undefined optional input retains the same result hash. Root can still load the prior planner privately for review, but CI needs no old commit object. No baseline source, peer source, or snapshot is replaced.

Final focused command:

```sh
node /tmp/run-plan-preview-472-focused.mjs src/lib/workbook-progress-plan.test.ts src/lib/workbook-plan.test.ts src/lib/workbook-plan-steps.test.ts
```

Result: 3 files, 150 tests, 150 passed, exit 0. The exact filtered task array is `/tmp/plan-preview-472-tests.json`. Recounting that array returned 150 passes. The log is `/tmp/plan-preview-472-focused.log`.

The runner uses `startVitest` from the approved borrowed tool directory. Its options are this checkout as `root`, exactly the three filters and includes above, `run: true`, `watch: false`, `maxWorkers: 1`, `cache: false`, and `testTimeout: 30000`. Vite uses `configFile: false`, `envDir: false`, a `/tmp` cache path, and explicit aliases for this checkout's `src`, installed Vitest, and installed esbuild. It closes the context in `finally`.

The preview tests assert real teaching-part step fields across all selected teaching days. They cover complete 74/100, 75/100, 89/100, 90/100, and 100/100 samples at U4 and U16; incomplete observed 100 percent; unknown causes; conceptual regression and focused-practice intent; careless/check-work; issued repeats zero/one/two; duplicate originals; changed approach; parent original adjudication versus later fixes; stale fixes; actual Fix it avoidance; retained other-skill inputs; absent samples; first/final steps; zero/higher proven prefixes; mastery-gap refusal; malformed versions and identities; and caller mutation.

Three binding negative controls call the pinned old public planner with the actual composed input. The base ignores the progress directive. Its resulting teaching steps fail the same held-target assertion for repeat, regression, and changed approach. Each candidate plan passes. Three further controls at 74, 80, and 90 percent show that the old planner enters a level test at `inLevel: 100` while the candidate plan does not.

Scoped commands:

```sh
node /tmp/run-plan-preview-472-scoped.mjs
node /tmp/run-plan-preview-472-baseline.mjs
git diff --check
```

Scoped ESLint: exactly the four changed TypeScript files, zero errors, zero warnings, exit 0. Scoped TypeScript: those four root files and their imports, zero diagnostics, exit 0. The log is `/tmp/plan-preview-472-scoped.log`. The baseline comparison array is `/tmp/plan-preview-472-baseline-comparison.json`.

The scoped runner uses installed Next ESLint rule packages with `overrideConfigFile: true`. It uses this checkout's TypeScript options with `noEmit: true`, `incremental: false`, `plugins: []`, and Node types from the approved borrowed directory. Source resolution tries this checkout first, then installed packages. No peer project configuration is read. ESLint prints a React auto-detection notice because this checkout has no installed React package; this is not a source warning.

Node is `v22.23.1`. Vitest is `4.1.11`. Installed tools were verified before use at `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules`. No install or symlink was made. An initial source parse found one extra closing parenthesis; it was corrected before the first test run. The first lint run found one unused test type import; it was removed. Final source checks passed.

| Subsystem | Proved here | Limit |
|---|---|---|
| Legacy planner | Exact base and pre-edit byte equality in 20 representative cases; existing pure planner tests pass. | No universal generation or printed-output proof. |
| Progress consumption | Actual targets, explicit metadata, repeat/regression controls, and prerequisite retention. | Inputs are trusted saved projections; no real issue ledger is written. |
| Fix it | Actual original question/event avoidance and version-bound fix behavior through the planner. | No generated replacement question or printed page. |
| Reviews | Full saved arrays and other-skill inputs remain; existing placement rules run. | No new schedule computation or #473 acceptance. |
| Evidence | Exact used versions, held unfinished evidence, and independent output ownership. | No reader pagination, snapshot storage, authorization, or hosted retention. |
| Lint and types | Four scoped source roots pass. | No application build or full gate. |

## Caller obligations and remaining root work

The caller must authenticate the family, delivered workbook ownership, selection approval, prior mastery proof, frozen curriculum version, and full expected sample against trusted stored packages and teaching context. The reference strings and declared version do not authenticate their contents. The caller must establish causes from permitted evidence and supply complete issued decision history. This pure module cannot detect a falsely omitted sample item or issued repeat.

The caller must paginate permitted canonical history, select exact effective result versions at the cutoff, exclude current-book early Days 8 to 10 from normal Day 7 evidence, and retain older and later-book readings. Do not substitute an all-days current profile for the frozen planning scope. Saved review arrays must already be validated for all skills.

Root must add snapshot and preview storage, the full history reader and pagination proof, the Admin UI, and any later generator integration. Root owns the remaining #475 UI and transport proof, #473 review scheduling, and the #476 queue. No flag or writer eligibility was widened. Do not feed this optional preview policy to a generator or renderer as an accepted print contract.

Root must obtain the next independent review and run any later full, hosted, browser, release, or publishing gates. No full suite, build, generation, render, Chromium, browser, server, provider/model call, hosted write, migration, credential read, customer/book write, email, charge, deletion, push, PR, watch, or issue closure ran here. No heavy reservation or main position was taken. Email #684 and Robin #699 remain root's queue concerns.

The local implementation commit uses the exact requested legacy co-author trailer. Hooks were disabled for local commits so no unrelated heavy task could start. All owned check processes exited. The delivered branch contains only the four implementation files and this report relative to the approved feature base.


## Root test portability correction

The initial test setup at 98255f51 executed git show for the feature base. The required CI checkout does not configure full history. A bounded run with an empty GIT_OBJECT_DIRECTORY failed the old global setup before any assertion ran: one failed file, 75 tests not run, exit 1. This proves the old-object dependency. It does not represent 75 product failures.

The corrected tests use the exact pre-edit baseline input/result hashes and do not invoke Git. Ignored-progress controls now call the public planner with progress explicitly undefined. They still prove the repeat, regression and changed-approach assertions fail when the opt-in input is ignored.

With the same empty Git object directory, all 245 tests in four files passed, exit 0: the new preview file, both existing pure planner files and the approved core file. This is a fresh combined selection, not the delegate's prior 150-test count. A separate in-memory mutation changed the default returned pagesADay minimum by one. All 20 result-hash checks failed, the distribution check passed and 55 unrelated cases were outside the selected pattern. Exit 1. The mutation changed no tracked file. This demonstrates that the portable baseline still rejects changed legacy behavior.

Scoped lint across the four preview implementation/test roots passed with zero errors and warnings. Scoped TypeScript returned zero diagnostics. Root changed only the new preview tests and this report; the delivered planner, adapter, fixture and approved core remain byte-identical to 98255f51.

Private evidence is in overnight-20261107/472-preview-history-prior.*, 472-preview-history-fixed.*, 472-preview-default-mutant.*, 472-preview-scoped.* and 472-legacy-manifest.json. The inherited /tmp baseline artifact remains private synthetic evidence. The correction still requires independent Sol review. It gives no application build, whole-feature, hosted, browser, print or customer acceptance.


## Independent bounded acceptance

Sol review passed SPEC and STANDARDS at 7f1fd64e. Fresh checks passed 245 tests and 783 independent probes, scoped lint and types. The default-plan mutation failed all 20 baseline result checks as required. Tracked source and index stayed unchanged. See workbook-plan-preview-472-independent-review.md. This accepts only the pure preview and its portability repair. It does not establish paginated source history, persisted previews, UI approval, generation, printing, whole-feature or release acceptance.
