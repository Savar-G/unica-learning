# Workbook progress pure core, #472

HANDOFF_READY

This change completes only the authorized pure core. It does not complete #472. The real planner does not consume these decisions yet. No customer or recognition approval is granted.

## Source and location

- Computer: `Savars-MacBook-Pro-5.local`.
- Assigned path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-5cfc230e`.
- Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-5cfc230e`.
- Branch: `site/workbook-progress-core-472-5cfc230e`.
- Initial clean HEAD: `550fdcf1619c0e515e8ac33e2a65869d8c937af7`.
- Exact required merged PR697 base: `89963c956d5eee2b87d18c58e9c35181b9aeef7f`.
- Exact implementation HEAD: `e29e7d6c45a179610b5bb27dcd4a09c3d2bf9ec4`.
- Initial implementation commit: `2ede32d312cbc8462c859c52d8b6365a1bff7af0`. The next source commit adds the absent-sample deferral checks.
- The next commit adds only this handoff. The final task reply gives its exact HEAD. Resolve it locally with `git rev-parse HEAD`.
- Actual implementation model/account: Unify Codex `gpt-6.1-sol`, high reasoning effort. The required legacy `Claude Opus 5.5` trailer is not the implementation model.

The authorized fetch and fast-forward reached the required base before any file write. Only the assigned branch was renamed. No second checkout or agent was created. All work ran on the Mac because the assigned PC was unavailable.

## Owned files

Only these three new files belong to the change:

- `src/lib/workbook-progress.ts`.
- `src/lib/workbook-progress.test.ts`.
- `.design/research/workbook-progress-core-472-handoff.md`.

No helper file was needed. No existing source, test, planner, generator, curriculum, package, print, template, instruction, decision, migration, or configuration file changed.

## Public input contract

`deriveWorkbookProgress(snapshot, curriculum, history)` returns `WorkbookProgressResult`. `WORKBOOK_PROGRESS_VERSION` is 1. All source imports are type-only. The module reads no database, clock, random value, environment, network, model, or image. All times are caller-supplied nonnegative safe integer milliseconds. The cutoff includes results recorded at that exact time.

`ProgressSnapshot` identifies the parent, child, snapshot, cutoff, one selected skill/step, and a caller-validated approval reference. It binds a curriculum key/version. Its explicit scope lists permitted workbook IDs, immutable printed revisions, and printed days. Its required sample lists every expected original item, stored context schema version, printed question reference, and effective result version frozen at the cutoff. A null result version means no result was captured. Missing or empty samples cannot establish mastery.

`ProgressSampleItem.expected` reuses `ExpectedItem`. Observations reuse `Observation`, `ItemIdentity`, `TeachingReference`, `HelpState`, and the saved typed region readings. The adapter must obtain expected items from the trusted question package and frozen printed teaching context through the existing public eligibility contract. A client or model must not supply eligibility. This core checks the normalized contract for contradictory eligibility, context, step, scope, and version data. It does not run a second package eligibility calculator.

`ProgressCurriculum` is a narrow trusted slice with the selected skill, all of its ordered steps, and the exact curriculum version. It reuses `CurriculumKey`, `CurriculumSkill`, and `CurriculumStep`. The caller must bind its version to the actual trusted source. A string alone cannot prove that source or human approval.

`ProgressHistory.originals` contains scoped canonical original results. Each has one saved first reading, a contiguous ordered chain of explicit parent/admin original-mark changes, separate second tries, and a typed established cause. Every reading retains its observation, record time, event ID, model, and prompt. It contains no child name, image bytes, URL, or photo availability state. The observation can retain a photo revision ID as provenance.

Canonical keys encode the tuple `(workbookId, printedRevision, pageId, itemId)` as JSON. Photo IDs and region IDs do not create attempts. Exact duplicate canonical records collapse. Different records at the same key refuse the whole derivation. The core does not choose a newer conflicting submission. Duplicate frozen sample entries also refuse. Page IDs, page numbers, days, numbered question locations, event IDs, and second-try IDs must not conflict.

The supplied history must already be filtered to the exact frozen sample. Foreign parent/child/book/revision/page/item/day rows, future records, unsupported versions, inconsistent context, and mismatched consumed result versions refuse the whole result. Extra full-history rows are not silently filtered here. The future adapter must paginate first and select the permitted result versions before calling the core. Normal Day 7 scope must exclude current-book Days 8-10. A later snapshot can explicitly include those retained days and older books.

If the required sample is absent or empty, valid scoped history returns in `deferredOriginals`. The core still checks family identity, allowed book/revision/day, reading versions, cutoff, changes, tries, and conflicts. It consumes no item and invents no printed question reference or denominator. It returns `insufficient-evidence` with the same step and no repeat increment. The adapter must retain the deferred work instead of replacing it with empty planner misses. Foreign or malformed deferred evidence still refuses.

`ProgressHistory.issuedDecisions` contains the complete prior issued-book decision history for this selected step through the cutoff. It has its own schema version, family identity, curriculum version, issued book, decision ID, issue time, selected step, and action. Exact duplicate issue records collapse. Multiple decisions for one book or ambiguous equal issue times refuse. Scan count, retakes, and repeated preview calls do not increase repeat history.

## Public output contract and policies

A successful `WorkbookProgressDecision` contains the input snapshot ID, cutoff, curriculum version, selected step, target step, status, action, reason, score counts, prior repeats, requested repeat increment, representation/Maya request, parent follow-up, focused practice references, one-skill `passed`, unresolved planner `misses`, per-item evidence, consumed result versions, and saved review inputs.

The action is one of `retain-unfinished`, `advance`, `skill-complete`, `repeat-new-numbers`, `regress-represent`, `repeat-check-work`, `retain-review`, or `change-approach`. Refusals return only a typed reason. They do not echo private evidence. The module has no logging calls.

- Every eligible required item must have resolved first and effective original evidence. Any missing context, missing item, pending item, or uncertain evidence returns `insufficient-evidence`. The step remains unchanged. There is no repeat increment, regression, advancement, or focused-practice decision. Known unresolved misses and unfinished per-item states remain visible.
- Blank is resolved non-right. Try first, unscored activities, and ineligible parent checks do not enter the denominator. A parent check counts only when the trusted expected-item contract explicitly permits it.
- The effective original mark determines first-answer accuracy. An explicit parent mark change can correct that original adjudication. The first saved mark, score, reading, and provenance remain unchanged in `items[].first`. A successful later try can remove an unresolved miss but never changes first-answer accuracy. The paired tests distinguish these two operations.
- Help on the first attempt cannot be erased by a later original-mark change. `math-help` and `unknown` never count as independent success. A right result with such help remains `right_with_help` until a separate successful try resolves the miss.
- At least 90 percent independent effective original answers advance. At the last step, `skill-complete` retains the final valid target instead of inventing a step. At least 75 percent and below 90 percent requests new numbers on the same step. Integer cross-products determine the boundaries.
- Below 75 percent with at least two applicable established conceptual errors requests one step back and another representation. Step 1 remains step 1 with the representation request. Below 75 percent with every non-right cause established careless requests a check-your-work repeat. Any other low-score distribution returns explicit `retain-review` with `unknown-cause`.
- Causes require evidence IDs and original-result versions. Conceptual causes reference a conceptual entry by selected step position and index in the pinned trusted curriculum. Answer text never establishes a cause. A cause tied to an older original version remains in `items[].cause`, but `effectiveCause` becomes unknown after a mark change unless evidence establishes the current version. Unknown handwriting or arithmetic does not become careless by default.
- Three applicable occurrences of one trusted expected conceptual mistake request focused practice. The output includes the curriculum mistake reference, misconception ID if present, occurrence count, and canonical keys. Each original contributes once.
- Only consecutive prior issued `repeat` decisions count toward the cap. An issued changed approach ends that sequence. With two prior repeats, another repeat request becomes `change-approach`, with another representation, a Maya recommendation, parent follow-up, and no third identical repeat increment. This function requests an action; it does not issue a workbook or update a ledger.
- A second try must refer to an original version that existed when the try occurred. Older valid tries remain as evidence. They do not cancel a later parent wrong mark. A successful try on the current effective version removes that miss, including when assisted. The original score remains non-right.
- Time does not gate mastery. The core has no timing-speed input. Photo availability does not gate retained results. The saved wrong reading `56`, typed value, and model/prompt/event provenance survive a much later supplied cutoff.
- `reviews` and `missedReviews` reuse `SpacedReview`. Structurally valid caller-validated saved inputs pass through unchanged, including another skill's saved reviews. This core calculates no review schedule. The adapter must validate other-skill curriculum references.

`passed` assumes steps before the selected approved step were previously passed. It reports that count plus the selected step only on mastery. It does not lower that count to imitate regression. The future planner must consume the versioned target/action as well as this projection. Passing `passed` alone would ignore regression and changed approaches.

## Checks, falsifiers, and limits

The final source check used 80 public-interface tests in one touched test file with `maxWorkers: 1`. All passed. The tests use injected synthetic data. Full samples immediately below and at the percentage boundaries contain 74/100, 75/100, 89/100, and 90/100 independent results. They assert target step, action, representation, misses, saved readings, and consumed versions.

The stated falsifiers were advancement from an incomplete observed-100-percent sample, duplicate evidence changing the score, assisted work becoming independent success, a later try changing original accuracy, an older try canceling a later parent mark, a third identical issued repeat, lost saved reviews, and conflicting printed identities increasing the count. The tests also cover known/unknown causes, repeats 0/1/2, blank, exclusions, missing sample/context, scope/cutoff/version refusal, first/final-step boundaries, frozen inputs, and retained wrong readings.

The assigned checkout had no `node_modules`. No dependency install or symlink was created. Checks loaded existing installed tools from `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules`. Only this checkout's source was tested. No other checkout's source was changed.

- Vitest 4.1.11: PASS, 1 file, 80 tests. The Node `startVitest` API used filter `src/lib/workbook-progress.test.ts`, `run: true`, `watch: false`, `maxWorkers: 1`, and `cache: false`. Vite used `configFile: false`, `envDir: false`, this checkout as root, a `/tmp/workbook-progress-472-vite-cache` cache, and explicit aliases for this checkout's `src` and the installed Vitest entry. The Vitest context closed after the run. No environment file was loaded.
- Scoped ESLint: PASS, 2 files, 0 errors, 0 warnings. The Node ESLint API used the same `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` configurations as the repository. It used `overrideConfigFile: true` and exactly the two new TypeScript files. The plugin printed a React auto-detection notice because this checkout has no installed React package. This was not a source warning.
- Scoped TypeScript: PASS, 0 diagnostics. A TypeScript program used the repository compiler options, exactly the two new root files and their imports, `noEmit: true`, `incremental: false`, and no Next plugin. Type and package resolution fell back to the existing tool dependency directory. No application build ran.
- Staged implementation whitespace: PASS. The implementation commit contains only the two new TypeScript files.

Progress policy tests prove deterministic behavior over the supplied normalized records. They do not prove authorization, admission, database uniqueness, accurate cause establishment, or sample completeness at its source. The type check validates the scoped import graph. It does not prove the application build. Reading retention proves that this pure projection does not depend on image age. It does not prove hosted retention, history pagination, storage expiry, or family deletion.

No full suite, render, Chromium job, build, browser, paid model call, provider/service mutation, migration, email, charge, switch, deletion, push, PR, or watch ran. Local commits disabled hooks so an unrelated heavy job could not start. All owned check processes stopped.

## Unresolved policy and adapter requirements

Root must review the distinction between parent correction of the original adjudication and the child's later fix. This implementation follows the canonical effective-result contract: a parent original-mark correction changes effective first-answer accuracy; a later try cannot. The immutable first stored score and reading remain available. The core does not interpret a generic parent "fixed" signal as an original-mark correction.

The required sample, approval reference, complete issued-decision history, ownership, and established cause are trusted adapter obligations. The core cannot detect an item omitted from a falsely declared frozen sample or an issued repeat omitted from history. It refuses old curriculum/context versions rather than guessing how to migrate them. Tied issue times refuse because there is no supplied book-sequence tie-break contract. Second tries at a mark-change timestamp must name the newly effective version.

This bounded cause contract accepts conceptual evidence only through trusted expected-mistake references. It does not invent a classifier for repeated wrong methods outside that list. Such evidence remains unknown unless a later contract explicitly represents it. A representation request names the current representation and asks for another; it does not select a new curriculum representation or schedule a Maya call.

## Remaining root work

- Add versioned planner consumption for target/action, repeat/regression, changed approach, representation, and focused practice. Prove the actual next plan and Fix it output through the public entry point.
- Add the public `previewNextWorkbookPlan` adapter. Save exact preview inputs, snapshot, decisions, and consumed versions. Do not pass raw markings directly as `PlanInput.passed`.
- Read the complete permitted canonical history across response pages. Construct immutable first readings, effective original changes, second tries, and versioned causes. Prove old wrong readings after image expiry through the real public reader and later-book preview.
- Validate the frozen sample against the trusted printed package/context and delivered ownership. Apply normal Day 7 versus later-book/backstop scope before derivation. Keep current-book early Days 8-10 out of normal Day 7 evidence.
- Complete storage, additive persistence, hosted RLS, concurrency, retention, and family-deletion proof. Preserve all canonical history independently of image expiry.
- Complete the admin UI through the required design and browser work. Complete remaining #475 UI/transport proof. Do not treat #455 source or parent correction source merges as wider #458 acceptance or customer/recognition approval.
- Keep #473's review-schedule and multi-skill computation separate. This core only preserves valid saved review inputs.
- Obtain independent review, settle the stated assumptions, run the required full test/lint/build/browser gate, and handle any later push/PR. The implementation sub-agent did not run those actions.

HANDOFF_READY remains pending root consumption. Root can change the marker after integration.
