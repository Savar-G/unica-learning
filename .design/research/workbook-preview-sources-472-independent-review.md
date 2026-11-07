HANDOFF_DONE

SPEC: PASS
STANDARDS: PASS
VERDICT: PASS for the bounded, non-UI, unavailable-only source-preview slice.

No confirmed P1, P2, or lower-severity defect was found. This result does not accept all of #472. It does not authorize a successful plan, a caller, production deployment, or printing.

## Machine and frozen source

- Machine: `Savars-MacBook-Pro-5.local`, verified with `hostname`.
- Model and effort: `gpt-6.1-sol`, high, confirmed by the session runtime. Unify Codex is the controller-assigned account; this review did not inspect account credentials.
- Checkout: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-2e85c291`.
- Physical checkout: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-2e85c291`.
- Branch: `site/workbook-preview-sources-472`, verified before review and before this report.
- HEAD: `e1c0880d3b363d97d496a990fb86856cc7902367`.
- Base: `4e07e83447750ce901e252a5ccb6f9e57b0a50c9`.
- Fixed comparison: `git diff 4e07e83447750ce901e252a5ccb6f9e57b0a50c9...HEAD`.
- Scope: all 15 added files, 1,365 added lines, zero removed lines. Initial status was clean.

I read `AGENTS.md`, the assigned handoff, all added implementation, test, fixture, and migration files, and the relevant existing source and SQL. I used the code-review SPEC and STANDARDS axes and the Unica evidence-review procedure. The explicit instruction to work alone superseded the skill's parallel review step. No child ran. The PC remained excluded as instructed.

## Falsifiers and source review

I stated these failure conditions before the checks: caller-supplied planning truth enters the source path; pagination loses rows; an absent source becomes complete evidence; a saved record changes after restart; a conflicting scope, hash, version, or actor passes; private readback bypasses current access; or a concurrent save passes a deletion fence.

| Area | Evidence and conclusion |
| --- | --- |
| Request and credentials | `src/lib/workbook-progress-source.ts:80` rejects extra request keys. `src/lib/workbook-preview-server.ts:12` checks the live Admin seam before source credentials. Existing `adminSession` checks both verified Auth identity and database Admin membership. Failed checks return unavailable without private diagnostics. |
| Catalog and sample | `src/lib/workbook-progress-source-store.ts:10` uses exact remaining counts, ordered exclusive cursors, bounds, and an empty tail. `src/lib/workbook-progress-source.ts:101` validates scoped stored packages, teaching contexts, contracts, manifests, marks, and change identities. The required sample comes from printed items, including unmarked items. Current Days 8-10 stay outside Day 7. |
| Missing truth | `src/lib/workbook-progress-source.ts:224` always returns unavailable. Prior mastery, full frozen planning input, issued decisions, corrections, and causes remain unavailable. Decision and plan are null. Consumed versions are empty. Current profile metadata and retained frames do not become historical mastery facts. |
| Cutoff | Delivery must be through the cutoff. Raw later result/help rows remain retained evidence with `loaded-not-derived` status. An independent future help-row probe retained that row but produced no decision, plan, or consumed version. It made no complete cutoff-history claim. |
| Restart and conflicts | `src/lib/workbook-preview-record.ts:35` checks the payload hash, engine, actor, exact request, and rebuilt full document. The server reads an existing record before source capture. Changed source data cannot replace the first saved document on retry. |
| SQL trust and access | The new RPC accepts a trusted server actor and checks live `admin_users`. Anonymous and authenticated roles cannot execute it. Direct authenticated reads require the creating actor, current Admin membership, live family/child access, and the selected printed revision. The checked server seam remains necessary; the service key alone does not identify a browser caller. |
| Locks and deletion | The RPC takes the parent SHARE lock before the family scan advisory lock. It checks deletion rows and locks workbook rows before admission. I checked the actual family fence, child fence, delivery, and printed-book lock functions. Current delivery/shipment child locks use NO KEY UPDATE, which permits the inserted preview's child foreign-key KEY SHARE lock. The new table has explicit family/child triggers and cascading foreign keys. |
| Existing behavior | The fixed diff adds files only. Existing generator, progress core, history reader, planner, marking code, default marking guard, and generated database types remain unchanged. No route, worker, switch, or admission caller is added. |

## Fresh checks

All commands ran on the assigned Mac checkout. No full suite, build, Chromium, server, hosted service, provider, browser, email, paid call, or customer operation ran.

1. Focused public-interface tests:

   `node_modules/.bin/vitest run src/lib/workbook-progress-source.test.ts src/lib/workbook-progress-source-store.test.ts src/lib/workbook-preview-record.test.ts src/lib/workbook-preview-server.test.ts --maxWorkers=1 --reporter=json --outputFile=/tmp/preview472-independent-focused.json`

   Exit 0. The final JSON recount reports 83 passed tests, zero failed tests, and zero pending tests in four files: source 37, source adapter 16, record/repository 23, and server 7.

2. Actual local migration and repository:

   `node supabase/tests/workbook_preview_sources.cjs`

   Exit 0. PostgreSQL 18.6. All 15 supplied cases passed. Separate database sessions exercised concurrent exact saves, concurrent conflicts, and the waiting-save/family-freeze race. The cluster stopped and its directory was removed.

3. Independent local SQL extension:

   `node /tmp/preview472-independent-sql-controls.cjs`

   Exit 0. It compiled a private in-memory extension of the actual runner. All 19 cases passed: the same 15 plus future-cutoff refusal, exclusion of another live Admin, repository refusal of changed saved scope, and effective browser RPC/INSERT privilege checks. This is 19 distinct SQL cases, not 34. Its cluster stopped and its directory was removed. An initial temporary harness syntax error was corrected before SQL execution.

4. Binding public controls:

   `node /tmp/preview472-independent-controls.cjs`

   Exit 0. All 12 control cases passed. Baselines preserved the 123-item required sample at API caps 1, 37, and 100. An in-memory short-page-completion mutation lost required data at caps 1 and 37; the assertions caught both failures. Cap 100 remained the positive control. Removing the saved-document comparison admitted five altered fields that the candidate refused: request hash, source hash, plan, decision, and sample. No product file changed.

   The future-row case counted the entire retained event set by source and cutoff: 126 marking events through cutoff and one call after cutoff. The outcome remained unavailable with null decision/plan and no consumed versions.

5. Binding SQL access control:

   A private in-memory migration mutation granted authenticated callers EXECUTE on `workbook_preview_command`. The actual browser-denial test then failed because a browser-role call could use the supplied live Admin actor. The wrapper verified exit 1 and cluster cleanup. This is an expected negative control, not a candidate failure. Evidence: `/tmp/preview472-independent-acl-mutant.log`.

6. Scoped ESLint on the ten added TypeScript files exited 0 with no output.

## What the checks prove

- Source loading: proves scoped pagination, unmarked sample retention, source-change refusal, and tested foreign/version conflicts. It does not prove hosted PostgREST behavior or an atomic source snapshot.
- Saved records: proves tested immutable retries, restart replay, hash/engine/scope validation, and rejection of injected results. It does not prove hosted durability or future engine compatibility.
- Authorization: proves checked-seam ordering under mocks and actual local SQL role restrictions. It does not prove hosted Auth, deployed grants, or a browser transport.
- SQL concurrency and deletion: proves tested separate-session save/freeze behavior, update refusal, denied direct writes, and local cascade removal. It does not prove the full migration chain or hosted deletion workers.
- Existing progress policy: remains unchanged. These checks do not supply the missing canonical inputs needed for a successful plan.

## Limits and root work

The migration remains unapplied. Official generated types and the actual typed RPC transport remain root work. Their documented absence is not a new defect in this assigned slice.

The two captures are an observed-source check. They do not make a transactional snapshot of every help/profile/source write. The handoff states this limit, and the candidate does not claim complete evidence or issue a plan. Future complete planning and transactional admission remain separate work.

Root retains hosted verification, generated types, full-schema integration, the serial full gate, exact-head CI, coordinated merge, and Savar's UI approval. None is claimed by this local review.

## Source preservation and cleanup

The final recount found all 4,118 original tracked regular files unchanged by SHA-256. The Git index remains unchanged at SHA-256 `aa1f02aa6502db2db6584ff07d755559ed81eb92fd8d01d1d50ff5c1f2dbe728`.

All owned test processes exited. All three private PostgreSQL clusters, including the negative-control cluster, stopped and were removed. No owned background process remains. Private probe scripts and synthetic JSON/log evidence are under `/tmp`; they contain no real family data. The only repository write is this report. No branch switch, checkout creation, source edit, stage, commit, push, PR action, or hosted operation occurred.

SPEC: PASS
STANDARDS: PASS
VERDICT: PASS
HANDOFF_DONE
