# PD470 final Spec recheck

Spec result: APPROVE. F1 is corrected. No new Spec defect was reproduced within this recheck.

## Fixed source and scope

- Computer: Savars-MacBook-Pro-5.local.
- Runtime: Unify Codex, gpt-6.1-sol, high reasoning effort.
- App-created checkout: /Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-8f7f34bc.
- Resolved checkout: /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-8f7f34bc.
- Branch: site/scan-page-history.
- Candidate: c7850f56beb10dde86b4d49b43315eacb2249992.
- Merge parents: 2034c13011a3335bf9585aa4a6de5b7716a5737e and bd99961874a88700ca7de2ac72609a0aaed69f75.
- Original rejected candidate: 7fe942bc2923ab9b51247c23463e8302e251499c.
- The checkout had no tracked or untracked changes before or after the checks.

The first read confirmed the literal HANDOFF_PD470_FINAL_RECHECK marker in pd470-final-recheck-brief.md. Authority included the cached #470 issue, pd470-independent-review.md, the five source evidence reports named in the brief, AGENTS.md, applicable DESIGN.md rules, docs/scan-pages.md and docs/scan-marking.md. I used the Unica evidence review procedure.

This report covers the Spec axis only. It checks F1, scan session changes, and the Admin static preview integration. It does not repeat the initial S8 review. It gives no Standards verdict, merge approval, or release approval.

## Failure conditions

Before the checks, I stated these failure conditions:

- Any of the three actual public callbacks retains a private identifier from an F1 input.
- A late success or failure changes the replacement account or child view.
- An old controller makes a new request after account replacement.
- The static Admin preview loses its supplied state or starts a request, provider, or event.
- Conflict resolution changes Send, S4/S5, shared readers, or publication behavior.

## Existing public-interface tests

Command, from the frozen checkout:

```sh
node node_modules/vitest/vitest.mjs run --no-cache --configLoader runner src/lib/url-tokens.test.ts src/lib/analytics.test.ts src/lib/scan-analytics.test.ts src/lib/scan-track.test.ts src/components/scan-pages.test.ts src/components/scan-history.test.ts src/components/scan-mark-change.test.ts src/components/parent-preview-analytics.test.ts src/components/admin-parent-preview.test.ts
```

Result: 9 files passed. All 184 tests passed. Exit 0. No full suite or build ran.

These tests use public exports. They cover consent, fixed scan packets, malformed URLs, pending upload work, replacement-account history and review, result navigation, and static Admin output. They use local account, network, and rendering substitutes. They do not prove a real account transition or external transmission.

## F1 control and corrected behavior

Location of the repair: src/lib/url-tokens.ts:7.

I bundled the old source from git show in memory with esbuild write:false. The old-source loader read each imported src TS/TSX module at 7fe942bc2923ab9b51247c23463e8302e251499c. It did not change the worktree. I then loaded the candidate through the same entry exports.

The PostHog control called the actual before_send function supplied by createAnalytics to a fake client. The Vercel controls called the actual scrubAnalyticsEvent and scrubSpeedEvent exports. All inputs used synthetic private values. No SDK transmission ran.

The original F1 inputs were:

```text
https://unicalearning.com/account%2Fscan%2Fresults%2FPRIVATE_PHOTO%ZZ?child=PRIVATE_CHILD
https://unicalearning.com/error%2Fapi%2Faccount%2Fscans%2FPRIVATE_PHOTO%FF%2Fimage?token=PRIVATE_TOKEN
```

All six old callback results retained PRIVATE values. All six candidate results were null. This independently reproduces F1 before the repair.

I also checked these three regression inputs:

```text
/error?next=%2Faccount%2Fscan%2FPRIVATE_PHOTO%E0%A4%A
/account%2Fscan%2FPRIVATE_PHOTO%
/error%252Fapi%252Faccount%252Fscans%252FPRIVATE_PHOTO%25FF
```

| Check | Old source | Candidate |
| --- | --- | --- |
| Five malformed inputs through three callbacks | All 15 callbacks retained an event; 13 retained PRIVATE values | All 15 returned null |
| Both exported redactors, five malformed inputs | All 10 retained PRIVATE values | All 10 removed PRIVATE values |
| Nine private controls through three callbacks | All 27 blocked | All 27 blocked |
| Eight valid public controls through three callbacks | All 24 admitted | All 24 admitted |
| Five later public events with malformed referrer, previous-page, nested error and breadcrumb values | Not used as the old control | All 15 assertions passed |

Private controls included canonical scan and image routes, an error route, nested query values, escaped separators, encoded separators, Admin paths, and 12 encoding layers. Public controls included root, resources, account, blog, encoded spaces in paths and queries, and /account/scanning. Thus, a callback that drops every event would fail this check.

The completed comparison passed 158 assertions: 67 old-behavior assertions and 91 candidate assertions. Expected old privacy failures are recorded above. They are not candidate passes.

The first draft of this probe assumed that all five old inputs leaked through every callback. It also called a nonexistent cleanup method. That draft exited 1. The corrected probe records the full old distribution and uses no such method. Its 158 assertions passed with exit 0. No source changed between runs.

## Scan session and Admin integration controls

Relevant source:

- src/components/scan-pages.tsx:91 retains optional initial data.
- src/components/scan-pages.tsx:141 checks the session before a load, after success, and after failure.
- src/components/scan-pages.tsx:151 invalidates the old account and clears its state.
- src/components/admin-parent-preview.tsx:161 supplies synthetic scan state.
- src/components/admin-parent-preview.tsx:167 renders the actual components as static HTML.

An independent in-memory program mounted the actual ScanPages export in happy-dom. It used fake fetch, account callbacks, image URLs, event transport, and photo preparation. It held the old listing request while the view changed. It ran both late success and late failure for account replacement and child selection.

All old results stayed absent. The new child's result stayed present. Account replacement retained its notice and removed images. A later child-selection event and file-input event made no request or upload outcome for the old account. Separate unchanged-session controls confirmed that success still displays a listing and failure still displays the load error. These controls prevent an inactive controller from passing.

The same program called the actual renderParentPreview and previewSelection exports. It checked empty, loading, unavailable, ready, sent, and refused scan states at phone and desktop sizes. Each output retained the correct state text and selected Kai in the two-child family. All controls were disabled. No active URL, form, script, or private image request remained. No network, provider, or event callback ran.

Result: 76 of 76 assertions passed.

For a binding negative control, I changed only the compiled in-memory ScanPages content. I removed the load guards and removed initial listing/loadFailed state. The same 76 assertions then produced 18 expected failures: stale account/child results, late account failure, new requests after replacement, and missing static preview states. The other 58 assertions passed. This control exited 1 as expected. The unmodified candidate then passed all 76 assertions again with exit 0.

These are local component and static HTML checks. They do not prove browser layout, a camera, Storage delivery, real Auth ordering, or device behavior.

## Preserved boundaries

I compared scan-pages.tsx with both merge parents. Relative to the repair parent, the merge adds the exported ScanListing type and optional initial state. The S8 session and epoch guards remain. Relative to main, the expected S8 guards, event checks, and history component remain.

A machine-selected comparison covered 13 non-test files: Send and marking routes, marking core/store/server/AI/reader, observation projection, the two review components, both history modules, and the S8 migration. All 13 were identical to the repair parent. Eight were also identical to main. The two review components contain the earlier S8 changes. The three new history files do not exist in main. Conflict resolution introduced none of those changes.

Additional diffs confirmed that scan API handlers and scan migrations are unchanged from the repair parent. S4/S5 migrations and learning-event/child-profile code are unchanged from main. The existing Send component tests passed. I did not repeat SQL, publication, hosted, or full-suite checks for unchanged code.

## Proof limits and final state

The root's reported complete gate, hosted rollback checks, generated types, and browser checks remain supplied evidence. They are not independent results of this review. The reported full gate is 456 files, 16,854 passing tests, one optional skip, source lint exit 0, and build exit 0. I did not rerun it.

The accepted hidden-family release, disabled Maya control, pending human screen approval, and shared launch approval remain in force. New answer-key, Schedule, Feedback, explanation, and chat changes are outside this fixed recheck.

No child agent, browser, credential read, hosted write, paid call, provider request, package install, source edit, full suite, build, push, or PR action ran. Independent bundles existed only in memory. The only intended persistent outputs are this report and pd470-final-spec-complete.md.

All test commands finished. The first successful component probe left a Node process open after it printed its result. I confirmed its PID and checkout, then stopped that owned process. Its exit was 143. The final unmodified run closed its test resources and exited 0. No owned test or application process remains.

VERDICT: APPROVE c7850f56beb10dde86b4d49b43315eacb2249992
