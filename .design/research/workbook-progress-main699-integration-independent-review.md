# Independent actual-main integration review, issue 472

HANDOFF_DONE

SPEC: PASS for this bounded integration.
STANDARDS: PASS for this bounded integration.
No confirmed integration finding.

## Exact source

- Machine: `Savars-MacBook-Pro-5.local`, verified with `hostname`.
- Runtime: Codex `gpt-6.1-sol`, high effort. The task specifies Unify Codex. No account credentials were read. The task reports the PC unreachable. No agent was started.
- Assigned checkout: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-470cdf68`.
- Physical checkout: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-470cdf68`.
- Branch: `site/workbook-progress-history-472`.
- Frozen HEAD: `2b0e18a48d774838f2f2e5f0b8157ed1398fd0d6`.
- First parent: `124e95f6056a6d052a0e109bfbbd747f16a4bc80`.
- Incoming parent, called main699: `6e39fd9756c109b45524230d108c4ed4912bf6d8`.
- Actual common base: `89963c956d5eee2b87d18c58e9c35181b9aeef7f`.

Git established the exact identities for the main699 and #697 base labels. Initial status was clean. No fetch or integration ran.

Read: actual `AGENTS.md`, delegate brief, core R2 and preview acceptance reports, history R3 acceptance and current handoff, relevant implementations/tests and typed consumers, and the three private `472-main699-*` evidence files. Prior approval applies at its prior pin. This review checks integration effects only.

## SPEC

Before checks, the falsifiers were: lost or changed parent files; changed default plans; lost generated declarations; changed marking admission; a new live caller or side effect; regression in version/correction/cutoff/scope checks; or incompatible typed reader queries.

Independent Git path sets, computed from the actual common base, contain 20 owned paths and 30 incoming paths. All match the respective parent tree entries. There are zero overlapping paths, zero unexpected merge paths, and zero unmerged index entries. All 50 changed working files also match HEAD, with the materialized LFS image checked separately.

The incoming `free-month-grade3-phone.png` is 83,062 bytes. Its SHA-256 is `73f60ca150225aa33507897c3f2c4027e4917d77d9a9dcc39407a1070ac9902d`, equal to the incoming LFS pointer.

Byte comparisons confirm the core matches `14cd5144cf2f6834193d1b71133a8fe8eaa10980`; planner/preview match `7f1fd64e4bca9faaf062c1ecc8e5daecb34f3c6a`; history/adapter match `b787dd8982dfdff6bb571b0f83dde1bd81713771`. Only two evidence files changed between that history pin and the owned parent.

The official `database.types.ts` exactly matches incoming main. Its sole delta from the common base adds `reserve_scan_marking_physical_evaluation_checked`. Its incoming migration retains service-role execution and revokes public/anon/authenticated execution. This is source proof, not hosted permission proof.

The database wrapper, marking access/launch/AI sources, generator job, placement, sample planning, and practice caller retain common-base/parent bytes. The generator still calls `planNextWorkbook` at `workbook-job.ts:630`; placement calls `planWorkbook` without progress at `workbook-placement.ts:101`. Source searches found no live caller of the new preview/history boundary. The owned feature adds no API, UI, migration, switch, model/key/price/worker change, or email function change.

The unchanged marking guard still requires exact `test-only`, a valid configured parent list when present, and a current test/Admin mark. The synthetic two-parent controls and unlisted-parent refusal passed. Deployed list values were not read.

## Fresh checks

Tools came from this checkout's installed packages: Node 22.23.1, Vitest 4.1.11, TypeScript 5.9.3, ESLint 9.39.5. No borrowed tools were used.

| Explicit test file | Passed |
| --- | ---: |
| `src/lib/workbook-progress.test.ts` | 94 |
| `src/lib/workbook-progress-plan.test.ts` | 76 |
| `src/lib/workbook-progress-history.test.ts` | 69 |
| `src/lib/workbook-progress-history-store.test.ts` | 28 |
| `src/lib/workbook-plan.test.ts` | 40 |
| `src/lib/workbook-plan-steps.test.ts` | 35 |
| `src/lib/scan-marking-server.test.ts` | 39 |
| `src/lib/scan-marking-physical.test.ts` | 22 |
| `src/lib/workbook-email.test.ts` | 29 |
| `src/lib/workbook-email-server.test.ts` | 14 |
| `src/lib/workbook-email-route.test.ts` | 10 |
| `src/lib/admin-workbook-emails.test.ts` | 1 |
| `src/components/workbook-emails.test.ts` | 6 |
| Total: 13 files | 463 |

All selected tests passed; zero unhandled errors; exit 0. Counts came from the executed Vitest task array, not prior reports. Command: `node --input-type=module` with a standard-input runner importing local `vitest/dist/node.js`. It supplied exactly the paths above to `startVitest`, with `maxWorkers:1`, `run:true`, `watch:false`, `cache:false`, `testTimeout:30000`, `configFile:false`, `envDir:false`, and the own-source `@` alias. Provider/service environment names were removed before worker creation. The runner closed Vitest and removed its private temporary cache in `finally`.

Separate `node --input-type=module` probes bundled the public planner and `legacyCases` in memory with local esbuild. A loader replaced only the planner module with `git show 6e39fd9756c109b45524230d108c4ed4912bf6d8:src/lib/workbook-plan.ts` for the control. All 40 full-result comparisons passed: 20 named U4/U16 baseline inputs with progress absent and the same 20 with progress undefined. Output shape and input preservation also passed. No source file was replaced.

Scoped ESLint command: `node node_modules/eslint/bin/eslint.js` with the 11 exact owned TypeScript paths from `git diff --name-only 89963c956d5eee2b87d18c58e9c35181b9aeef7f 124e95f6056a6d052a0e109bfbbd747f16a4bc80 -- src`. Zero diagnostics; exit 0.

Scoped TypeScript command: `node --input-type=module` using local `ts.createProgram`, own tsconfig options, `noEmit:true`, `incremental:false`, and no plugins. Roots were those 11 paths plus placement, sample-book, Maya practice generated, sample-profiles, workbook-job, admin-workbook-emails, workbook-email-server, scan-marking-physical, and `scripts/scan-marking-physical-cli.ts`. Final result: 20 roots and imports, zero diagnostics, exit 0. The first invocation incorrectly named nonexistent `workbook-sample-frame.ts` and returned TS6053, exit 1. The corrected selection uses `workbook-sample-profiles.ts`.

`git diff --check 89963c956d5eee2b87d18c58e9c35181b9aeef7f HEAD` passed, exit 0.

## STANDARDS and proof limits

| Subsystem | Proved | Passed through or unproved |
| --- | --- | --- |
| Merge/source | Exact parent preservation, approved implementation identities, generated declarations, LFS bytes. | Behavior, hosted state, and release approval. |
| Planner | Exact default equality for the 20-input set; public planner tests pass. | Other possible inputs and actual generation. |
| History/core | Current version, correction, cutoff, scope, and structural-manifest tests pass through the real pure preview. | Trusted caller proofs, complete automatic history, persistence, and hosted concurrency. |
| Typed reader | Current schema and typed consumers compile; synthetic client permits only GET/HEAD and tests pagination/refusal. | Hosted RLS, retention, deletion, and authorization. |
| Marking/email/physical | Existing guard and incoming fake-boundary tests pass. | Deployed flags, email delivery, provider execution, and physical recognition. |

No separate standards defect was found. Public-interface tests remain portable. The new store is read-only. No query type override was added. Declared missing UI, snapshot, caller proof, automatic ledger, and #471 work remain outside this review.

Final preservation recount: 20 owned paths, 30 incoming paths, zero overlap/failures. All 4,101 original tracked regular files retain the same combined byte digest, `6d196335932cd5ecc29f4b2c125f8f5a2f19d7fca24df9c3964200a404389941`. Index SHA-256 remains `1bfdebbe349e1dd03892c2a5af3202e69ff265ee98b6a732b0e1e5ab890e523d`. Only this report was added. All owned processes exited. Temporary test/probe data was removed. Root's full gate remains a separate result; this reviewer ran no full suite, build, browser, Chromium, server, service/DB/provider call, or customer action. No commit, push, comment, or watch ran.

This result gives no feature, customer, print, recognition, or release approval.

VERDICT: PASS - bounded actual-main integration only.
