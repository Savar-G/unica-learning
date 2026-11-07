# Independent main696 integration review

SPEC: PASS

STANDARDS: PASS

VERDICT: VERIFIED for the bounded integration of the approved #475 repair with actual main696. No new confirmed finding. Whole #475 acceptance remains incomplete.

## Source and scope

- Computer: `Savars-MacBook-Pro-5.local`, verified before and after the checks.
- Runtime: Codex `gpt-6.1-sol`, high reasoning effort. The task assigned the Unify account. No delegate or substitute model ran.
- Required checkout: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-b62d245e`.
- Physical checkout: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-b62d245e`.
- Verified branch: `site/workbook-scan-receipts-475`.
- Frozen candidate: `9f0e1fa761a551309c666cf2d9b202984e9895b3`.
- Prior approved repair: `da2020cda65058af37e08e2cc3d311d5cfdf8a41`.
- Report-only parent: `27d8acd5a5f92acda457225f8d0af658f9c3811b`.
- Incoming main696: `de1512717bd297a891069605cefab88d7ad13a54`.
- Merge: `7756237ff972bff204568cb4fd80445090f5316d`.
- Common base of the merge parents: `d4af3d62d5fba25ba3b39441d9cc719b2bf06604`.

The first command verified the machine, physical directory, branch, exact HEAD and empty status. The task supplied the PC's unreachable state. This reviewer made no PC connection attempt. The default checkout was not used. No checkout, branch, delegate or thread was created.

The review read the actual AGENTS.md, shared delegate brief, Unica evidence-review procedure, code-review procedure, `docs/workbook-scan-progress.md`, all four required prior reports, the saved evidence, the relevant source, and the SQL proof. The task's read-only, no-delegation and focused-check limits controlled the general procedures. Vault retrieval supplied no relevant project note. Memory supplied review procedure only; current source and results supplied the conclusions.

Falsifiers were stated before checks: lost source or declarations from either parent; regression of test-only scope, the final marker check, fatal permission failure, unknown retention or the confirmed delivery response; fixture rows that can survive the SQL proof; or written proof claims beyond the saved checks.

## Findings

No new confirmed SPEC or STANDARDS failure was found. No product correction is required by this bounded review. No actionable code smell was confirmed in the integration changes.

The application marker read and SQL admission remain separate operations. The review does not require them to be atomic. A marker change after committed admission cannot recall the provider admission.

## Parent preservation and database declarations

The main comparison was `git diff da2020cd..HEAD`. The full feature diff against actual incoming main supplied context. It was not treated as a new review of every prior feature.

A Python probe independently obtained each parent's changed paths from the common base. It then compared each selected Git blob with HEAD. The probe also checked every supplied path and blob in `475-main696-before.json` against Git. All supplied paths and blobs matched. A final repeat gave the same result:

| Set | Paths | Result |
| --- | ---: | --- |
| Owned parent changes | 61 | 59 owned-only paths preserved exactly |
| Incoming main changes | 137 | 135 incoming-only paths preserved exactly |
| Shared paths | 2 | `src/lib/database.ts`, `src/lib/database.types.ts` |
| Preservation failures | 0 | None |

The merge has the stated two parents. `27d8acd5` changes only the R2 handoff and independent report from the approved repair. `9f0e1fa7` changes only the hosted proof report and its SQL file from the merge. Thus the final proof commit changes no application source.

`git diff --numstat de1512717bd297a891069605cefab88d7ad13a54..HEAD -- src/lib/database.ts src/lib/database.types.ts` independently returned 4 additions/0 deletions and 327 additions/0 deletions, respectively.

The shared wrapper retains the owned nullable arguments for recovery, inactivity and reminder finish. It adds the incoming comment route, layout plan, edit kind and nullable layout-finish arguments. No shared member was removed. No query type bypass was found in the reviewed scan source.

A TypeScript AST probe compared every public table, function and other named declaration with both parents. All 372 owned declarations and all 354 incoming declarations remain unchanged. HEAD contains 372. The generated file is also byte-identical to the owned parent and generation commit `593aadd6361393e0b40fee59b1586a9e6697c0a7`. No generated declaration was edited during integration. The saved hosted schema report records `npm run db:types`; this reviewer did not call the generator or independently query the hosted schema.

## Integration checks

| Subsystem | What this review proved | What it only passed through or did not prove |
| --- | --- | --- |
| Recovery scope | The repaired helper remains unchanged. Fresh tests reject OFF/invalid release, unlisted or unmarked owners, foreign requests and marker removal. The valid control records the scoped clock. | SQL outcomes in these tests use fake HTTP. No hosted recovery ran. |
| Final admission | `workbook-scan-reminder-store.ts:185-189` still completes `current` before `beforeAdmit`. The production callback remains at `workbook-scan-maintenance-server.ts:66`. Fresh tests remove the marker during the links read and start no admission, provider or release. | The marker read is not atomic with SQL admission. The prior independent delayed-read probes remain prior evidence. |
| Fatal failure | `workbook-scan-maintenance.ts:90-111` retains fatal clock state. The factory retains failed permission state at `workbook-scan-maintenance-server.ts:54-64,98`. Fresh tests stop later phases and reject a second run without new requests. | No hosted permission outage ran. |
| Unknown outcome | Fresh sender/store/factory tests retain uncertain admission and provider outcomes. The unknown-send test starts one fake provider request across two runs. | No provider request ran. The saved hosted ledger proof is separate. |
| Confirmed delivery | `src/app/api/admin/workbooks/[id]/delivery/route.ts:37-44` retains its separate registration catch. Fresh public POST tests keep HTTP 200 after actual installed Next registration failures. Refusal, authorization, origin, zone and correction checks pass. | Delivery and authorization use test seams. No HTTP server or hosted confirmation ran. |
| Progress reader | The reader, store, endpoint and incoming canonical history source are preserved. Fresh reader and endpoint tests retain scope, pagination, separate accepted/marking state and the explicit public projection. | No live Auth session, PostgREST cap, browser or parent UI acceptance. |
| Incoming marking and dashboard | Incoming files match main exactly. Fresh marking, marking-server, parent home and Workbooks-page tests pass. The scoped compiler checks their shared types and callers. | No image/model call, rendered browser or new Schedule progress UI. |
| SQL integration | Incoming migrations were inspected for replacement of the owned scan or email functions. No such replacement was found. Owned receipt and episode SQL blobs remain exact. | No migration or SQL execution ran in this review. Prior concurrency reviews were not repeated. |

## SQL proof review

The actual SHA-256 of `supabase/tests/workbook_scan_reminder_hosted_rollback.sql` is `ee870a2387d984f4832e7804c165afc640d007438ca14f1edb0f643f5a1c5c8b`. It matches `475-hosted-proof.json`. The saved source pin is the merge; the proof commit changes no runtime source after that pin.

The SQL's fixture writes start inside the nested exception block at lines 11-12. Line 129 deliberately raises `P0475`. Line 130 catches that exception after PostgreSQL rolls back the subtransaction. Unexpected errors escape and cannot commit its fixture writes. The outer assertions at lines 132-136 check parent, Auth, workbook, email-log and copy absence. The session proof value is cleared at lines 140-141. This structure does not retain the inserted fixture rows. Sequence advancement remains possible and is correctly disclosed.

The saved positive result agrees with the executed source assertions: identical confirmation, one zero-scan HOLD, no next-book claim, recorded inactivity, claim/admission, one copy, one attempt, unknown message/consumed episode/claimed log retention, refused repeat claim and stale late finish. The role checks include an owner JWT identity check, a positive own-workbook read, zero owner private episodes, denied owner service RPC, zero foreign books, one admin episode, and anonymous table/RPC denial. The saved separate rollback object contains zero in all 11 reported row categories. This reviewer checked that saved object but did not repeat its hosted query.

A fresh in-memory probe extracted the SQL's delivery date, expected dates and manifest. It called the actual `deliveryDeadlines` and `scanInactivityCandidate` interfaces. Five assertions passed: four-day deadline, 21-day backstop, candidate state, candidate deadline and due state. Results were `2026-10-05T12:00:00.000Z` and `2026-10-22T12:00:00.000Z`. Runtime was Node `v22.23.1`, ICU `78.2`, tz `2026a`, matching the version recorded by the SQL.

The proof inserts a synthetic copy directly. It does not run the application's email transport or prove token hiding, delivery or unsubscribe. The fixture has three minimal pages/questions. It does not prove a complete printed package. The SQL's zero provider/storage fields are consistent with its command scope; they are not independent provider/storage telemetry. No concurrent hosted sessions, HTTP Auth, PostgREST, browser, provider, inbox, family deletion or retention proof is inferred. The written hosted report states those limits. No conclusion requiring an additional in-scope finding was found.

## Commands and counts

All fresh commands ran in the required checkout. No temporary source file or output artifact was created. Test JSON was captured and counted in memory through Python `subprocess.run` and `json.loads`.

```sh
node_modules/.bin/vitest run src/lib/workbook-scan-maintenance.test.ts src/lib/workbook-scan-maintenance-server.test.ts src/lib/workbook-scan-recovery-server.test.ts src/lib/workbook-scan-reminder-store.test.ts src/lib/workbook-scan-reminder-send.test.ts src/lib/workbook-delivery-progress-route.test.ts src/lib/workbook-scan-progress-reader.test.ts src/app/api/account/scans/progress/route.test.ts src/lib/scan-marking-server.test.ts src/lib/scan-marking.test.ts 'src/app/(product)/account/(dashboard)/workbooks/[child]/page.test.ts' 'src/app/(product)/account/(dashboard)/page.test.ts' --maxWorkers=1 --reporter=json
```

Exit 0. Full machine-filtered assertion distribution:

| Test file | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| `scan-marking-server.test.ts` | 39 | 0 | 0 |
| `scan-marking.test.ts` | 165 | 0 | 0 |
| `workbook-delivery-progress-route.test.ts` | 7 | 0 | 0 |
| `workbook-scan-maintenance-server.test.ts` | 22 | 0 | 0 |
| `workbook-scan-maintenance.test.ts` | 19 | 0 | 0 |
| `workbook-scan-progress-reader.test.ts` | 19 | 0 | 0 |
| `workbook-scan-recovery-server.test.ts` | 15 | 0 | 0 |
| `workbook-scan-reminder-send.test.ts` | 49 | 0 | 0 |
| `workbook-scan-reminder-store.test.ts` | 59 | 0 | 0 |
| Parent home `page.test.ts` | 43 | 0 | 0 |
| Progress endpoint `route.test.ts` | 15 | 0 | 0 |
| Workbooks child `page.test.ts` | 7 | 0 | 0 |
| Total, 12 files | 459 | 0 | 0 |

The supplied `475-main696-tests.log` contains a summary of 446 passed tests in 19 files. Its exit file contains 0. It has no per-file results or command. This review therefore verifies the saved summary, not an independent recount of that earlier selection. The fresh 459 count is a different, explicit selection. Counts are not added together. No new mutation or prior-pin test ran in the frozen checkout.

The supplied compiler log is empty and its exit file contains 0. A fresh `node -` compiler check independently used this checkout's TypeScript API and tsconfig. Its 54 scoped files comprise all 36 owned `src/` paths plus 18 incoming marking/dashboard source and test paths. It added the existing declaration files, set `noEmit:true` and `incremental:false`, and retained diagnostics for scoped files plus global errors. Result: 54 files, zero diagnostics, exit 0. This is not a whole-project type check or build.

```sh
node_modules/.bin/eslint src/lib/database.ts src/lib/workbook-scan-maintenance.ts src/lib/workbook-scan-maintenance-server.ts src/lib/workbook-scan-reminder-store.ts src/lib/workbook-scan-reminder-send.ts src/lib/workbook-scan-recovery-server.ts src/lib/workbook-scan-progress-reader.ts src/lib/workbook-scan-progress-store.ts src/lib/scan-marking-server.ts src/lib/scan-marking.ts src/app/api/account/scans/progress/route.ts 'src/app/api/admin/workbooks/[id]/delivery/route.ts' 'src/app/(product)/account/(dashboard)/workbooks/[child]/page.tsx'
```

Scoped ESLint: 13 files, no output, exit 0. `git diff --check da2020cd..HEAD -- src supabase`, `git diff --check`, and `git diff --cached --exit-code` returned 0. The source/SQL whitespace check does not claim to clean incoming evidence documents.

The other fresh commands were `hostname`, `pwd`, `git branch --show-current`, `git rev-parse HEAD`, `git status --porcelain=v1`, `git log -6 --format='%H %P %s'`, `git merge-base`, `git diff --name-only`, `git rev-parse <pin>:<path>`, `git diff --numstat`, and the in-memory Python/TypeScript/AST/calendar probes described above. The calendar probe used esbuild with `write:false`.

## Integrity, limits and remaining acceptance

All 4,065 tracked file contents were hashed before checks and again after checks. Zero changed. Initial and final tracked aggregate SHA-256: `33c59754a0d6ae85d9e7f9506ab70cc3c6443a23b41e6d392b5a4415e7874ed3`.

Initial and final index SHA-256: `a1183ad4b8a63e2f6102d50725fa079fa8b7d060b383b8563c119cface46b1eb`.

Only this untracked report is retained. All owned test, compiler, lint and probe processes stopped. No temporary checkout probe requires removal.

No full suite, build, Chromium, browser, server, provider/model call, hosted service call, migration, email, Auth fixture, settings change, customer/production write, commit, push, PR or comment ran. No environment file or credential was read. No source or index write ran. No release gate was changed. Maya's heavy window was preserved.

There is no actual next-book queue and no real-family reminder mode in this candidate. This review confirms neither feature. Safe-recipient transport/unsubscribe proof, Schedule design/UI approval, endpoint/browser proof, the final combined full gate, and exact-head remote checks remain open. No PR exists. This report gives no whole #475, customer R2, comment closure, printing or family release acceptance.

Final machine: `Savars-MacBook-Pro-5.local`.
Final branch: `site/workbook-scan-receipts-475`.
Final pin: `9f0e1fa761a551309c666cf2d9b202984e9895b3`.

SPEC: PASS
STANDARDS: PASS
VERDICT: VERIFIED for the bounded main696 integration only.

HANDOFF_DONE
