HANDOFF_READY

This change adds trusted source capture and immutable Admin preview records for the non-UI continuation of #472. It does not complete #472. The persisted outcome is explicitly unavailable. No plan or issued decision is fabricated from missing sources.

## Exact location and commits

- Computer: `Savars-MacBook-Pro-5.local`.
- Provider/model: the assigned Unify Codex session, `gpt-6.1-sol`, high reasoning effort.
- Prepared checkout: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-2e85c291`.
- Physical checkout: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-2e85c291`.
- Initial branch: `t3/workbook-preview-sources-472`.
- Final branch: `site/workbook-preview-sources-472`.
- Initial clean HEAD: `550fdcf1619c0e515e8ac33e2a65869d8c937af7`.
- Verified required base: actual merged PR700, `4e07e83447750ce901e252a5ccb6f9e57b0a50c9`.
- Initial implementation commit: `f9b3a6bc0d4072ba935f7faf2611ef935c58fe58`.
- Final implementation HEAD: `fcaeeb07807b72ce6f05fe28d72479433a9a3db5`. The second commit contains the final error handling for failed Auth reads and its test.
- The next commit contains only this report. The final delivery SHA is in the final response and is available with `git rev-parse HEAD`. A report cannot contain the hash of its own commit.

The first commands were `hostname`, `git branch --show-current`, `git status --short`, and `git rev-parse HEAD`. Each exited 0. Status was empty. `git merge-base --is-ancestor HEAD 4e07e83447750ce901e252a5ccb6f9e57b0a50c9` exited 0. The explicitly authorized `git merge --ff-only 4e07e83447750ce901e252a5ccb6f9e57b0a50c9` exited 0. `git branch -m site/workbook-preview-sources-472` exited 0. HEAD then matched the exact required base. No later main was imported.

The PC was unavailable, as stated in the task. All work ran in the assigned Mac checkout. No child, new checkout, branch switch, foreign credential, push, PR, watch, production merge, hosted database operation, paid provider call, browser, server, Chromium, generation, email, charge, family operation, or customer-book write ran. The local SQL fixtures use synthetic identities only. No real family fixture was read or changed.

The first-customer print freeze and overnight holds remain in force. The next-book sequence file and saved current issue body were read. The task's narrower instructions supersede their old apply-migration, full-gate, UI, and publishing instructions. No reviewed core/history/planner interface needed a change.

## Files changed

All files are new relative to the required base:

1. `src/lib/workbook-progress-source.ts`
2. `src/lib/workbook-progress-source-store.ts`
3. `src/lib/workbook-progress-source.fixture.ts`
4. `src/lib/workbook-progress-source.test.ts`
5. `src/lib/workbook-progress-source-store.test.ts`
6. `src/lib/workbook-preview-record.ts`
7. `src/lib/workbook-preview-record.test.ts`
8. `src/lib/workbook-preview-store.ts`
9. `src/lib/workbook-preview-server.ts`
10. `src/lib/workbook-preview-server.test.ts`
11. `supabase/migrations/20261107140215_workbook_preview_sources.sql`
12. `supabase/tests/workbook_preview_sources.cjs`
13. `supabase/tests/workbook_preview_sources_fixture.sql`
14. `supabase/tests/workbook_preview_sources_empty.cjs`
15. `.design/research/workbook-preview-sources-472-handoff.md`

The existing progress core, retained-history reader/store, preview planner, ordinary planner, generated database types, instruction files, UI, API routes, print files, provider code, marking code, profiles, reminder code and email code remain unchanged.

## Public boundary and source completeness

`saveAdminWorkbookPreview` and `readAdminWorkbookPreview` accept a strict version-1 request. It contains the request, parent, child, workbook and printed-revision identifiers, one unit/skill/step selection, an integer millisecond cutoff, and an explicit `day7`, `later-book` or `backstop` scope. Extra keys are refused. Packages, sample identities, mastery, planning input, and correction-completeness claims cannot enter in that request.

Both functions check the live `adminSession` seam. The seam uses the current session's verified Auth user and `is_admin`. Source credentials are obtained only after that check. The SQL repository is an internal server dependency. There is no default transport, route, switch, worker or next-book admission.

| Source | Actual read and identity | Completeness/result |
| --- | --- | --- |
| Admin access | Existing checked `adminSession`; SQL checks and locks the current `admin_users.user_id` actor. | Required on entry and saved reads. Service credentials alone do not authorize the browser caller. |
| Family access | `parents`, `children`, `family_deletions`, `child_deletions`, exact parent/child IDs. | Missing, foreign, frozen or deleting families are unavailable. SQL repeats the checks. |
| Delivered book | All selected-family book headers; exact shipped book, number, printed revision, manifest; original delivery and latest delivery correction. | Confirmed delivery is required. Persist actual delivery audit ID/time. Delivery after cutoff is refused. Postgres microseconds round forward. Shipment is never a delivery substitute. |
| Printed catalog | All stored page IDs/numbers/contracts and all question IDs/packages/regions/teaching contexts for every retained shipped book through the selected number. | Exact-count keyset pagination with an empty tail. Public print-contract, manifest, package and teaching validators run. Parent/book/page/package references and supported context version must agree. No image, PDF, Storage or QR-token read. |
| Required sample | Public `expectedItems` from the frozen catalog, restricted to the manifest's required pages and selected unit/skill/step. | Includes eligible items with no mark. Current-book Day7 excludes Days8-10. Explicit later/backstop scope can include them. Older book days remain retained. Optional pages do not enlarge the required sample. |
| Retained original results | All canonical `scan_marking_items`, excluding the owner-photo field. | Fully traversed and scope/observation checked. Keep written answer text and result versions with no photo-age predicate. This slice labels the rows `loaded-not-derived`, not a complete progress history. |
| Parent changes | All `scan_mark_changes` for the exact book/revision through the canonical-item relation. | Fully traversed. Validate retained previous/current observation identities and versions. Parent changes remain original adjudications. They do not establish a separate child attempt. |
| Help | All permitted workbook `learning_events` for the pinned books. | Fully traversed, including late rows. Preserve event identity/time. A Maya final answer is not a second try. No new help-order or cause inference runs. |
| Frozen plan version | Actual `workbook-approved` audit rows, their run IDs, and actual `workbook_run_frames` rows. | Save the full retained frames and hashes. A frame stores its plan, profile revision and curriculum version. It does not store the full original `PlanInput` or frozen profile facts. |
| Assessment/profile version | Read only current child-profile revision/schema/build-token/assessment metadata and retained learner-profile ID/schema/build-time/assessment metadata. | These are references, not historical facts. No mutable profile JSON is read or passed to the planner. A frame's profile revision cannot recover a deleted/replaced historical profile revision. |
| Prior step mastery | Inspect actual plan/profile/history contracts. `skill_state_history` records standard-level map states. | Unavailable. These states do not prove a contiguous curriculum step prefix. The selected printed step is not a passed prefix. |
| Planning input | Actual frame plan and source-version references. Existing `planNextWorkbook` creates an ordinary input but does not persist that complete input. | Unavailable. No scoped historical profile/review/miss/passed input is fabricated from today's profile or from the resulting plan. |
| Issued repeat history | Actual shipped-book catalog and approval/frame references. | Unavailable. No merged complete issued `IssuedProgressDecision` ledger exists. Book count, scan count and a repeated printed step are not an issued repeat action. |
| Second tries/fixed proof | Search actual merged source/schema and inspect the retained-history contract. | Unavailable. No complete canonical attempt source with exact original-result-version binding and completeness exists here. An empty correction list is never attested. |
| Causes | No canonical cause reader in this merged path. | Unavailable. Text such as `56` does not establish a conceptual or careless cause. |

The persisted reason tuple is `frozen-prior-mastery-unavailable`, `frozen-planning-input-unavailable`, `issued-decisions-unavailable`, and `corrections-unavailable`. `decision` and `plan` are null. `consumedVersions` is empty because no progress computation consumed a version. It is not a claim that the retained history is empty.

This version deliberately has no successful plan branch. It cannot call `deriveWorkbookProgress` or the planner with invented prior mastery or planning truth. It preserves the existing public `previewNextWorkbookPlanFromHistory` refusal for missing corrections. A binding public-interface control proves that the old internal synthetic completeness attestation can satisfy the history seam, then proves that the same seam refuses when corrections are unavailable. The new server request refuses that attestation entirely. Future source completion must feed the existing public history/core/preview modules. It must not add a new progress policy or review calculator.

Source capture reads the full bounded source set twice. Any observed difference refuses. Limits are 20 retained books, 2,000 pages per book, 20,000 aggregate paginated rows, 3,000 paginated requests per capture, a 3.5 MB retained-book payload, and a 4 MB saved document. A smaller positive API page does not imply completion. Missing counts, changing counts, a positive empty page, repeated cursors and safety bounds refuse.

## Immutable persistence

The version-1 document stores the exact validated request, cutoff, selected scope, frozen source rows/references, each source hash and version, request/source hashes, engine identity, and explicit unavailable outcome. The engine identity is `workbook-preview-sources/1;progress/1;history/1;plan-preview/1`.

`workbook_plan_previews` stores exact canonical UTF-8 payload text and its SHA256. The SQL constraint recomputes the payload hash. The public replay function validates the payload bound/hash, engine, owner/child/book/revision/request/cutoff/selection, rebuilds the versioned unavailable result from the saved sources, and compares the whole saved document. Unknown engines, malformed source JSON, altered source/request hashes, changed sample/results, or an injected plan/decision refuse. Replay reads no mutable profile.

The SQL port is isolated in `WorkbookPreviewSql`. It has the exact new RPC signature without widening a Supabase client, changing generated types, or hiding a wrong existing column. Local PostgreSQL tests call that actual RPC through the public repository and public replay module. Root must add the small generated-type-checked transport after the migration and official type generation.

The new table has RLS, explicit grants, parent/child/book composite foreign keys with `ON DELETE CASCADE`, both existing family/child write-fence triggers, an immutable-update trigger, and bounded payloads. Parents have no rows. Anonymous users have no table access. Browser roles cannot write or call the write RPC. Admin direct reads are scoped to the creating actor, the live family and the current printed revision. The service-only RPC checks the passed actor against live Admin membership, then checks family/child/book access.

A request ID is immutable. Identical concurrent saves settle as one save and one duplicate. A scope/actor/payload/hash conflict refuses. The server reads an existing record before source capture, so a lost-response retry does not replace saved truth after source changes. Readback still rechecks current Admin/family access. A new save checks the current marking revision and every captured book's manifest, printed revision and effective delivery audit/time under the family/scan locks. Existing-record retries preserve the first source set.

The capture is an optimistic observed-source read, not a transactionally complete canonical snapshot. In particular, this does not establish atomic admission for a help-event insert that does not take the scan-family lock. No complete plan is returned, and no consumed evidence or next-book admission is claimed. A later complete planning path needs the canonical source dependencies and the #476 snapshot/admission work. Do not promote this unavailable record into an issued decision.

## Local checks and exact results

Falsifiers were stated before each check group. They include lost unmarked sample items; early pagination completion; loss of an old written answer; browser truth injection; changed fences; foreign source ownership; different truth after restart; duplicate/conflicting concurrent saves; browser writes; and late writes after a family freeze.

Tool setup used only this checkout: `npm ci --ignore-scripts --no-audit --no-fund`, exit 0. It installed 672 packages. `node_modules` is a real directory, not a symlink. No peer checkout was changed. Node was `v22.23.1`; Vitest was `4.1.11`; local PostgreSQL was `18.6`.

Final focused command, exit 0:

```sh
node_modules/.bin/vitest run src/lib/workbook-progress-source.test.ts src/lib/workbook-progress-source-store.test.ts src/lib/workbook-preview-record.test.ts src/lib/workbook-preview-server.test.ts --maxWorkers=1 --reporter=json --outputFile=/tmp/workbook-preview-472-focused.json
```

The exact final machine-filtered set contains 83 passed tests and no failed or skipped tests. Its distribution is 37 source tests, 16 typed-adapter tests, 23 record/repository tests, and 7 checked-server tests. Evidence: `/tmp/workbook-preview-472-focused.json` and `/tmp/workbook-preview-472-focused.log`.

Local SQL command, exit 0:

```sh
node supabase/tests/workbook_preview_sources.cjs
```

The runner created a private UTF-8 PostgreSQL cluster on a Unix socket with TCP disabled. It applied the actual new migration to the reduced schema. It loaded the actual existing family/child fence functions from their migrations. All 15 named cases passed. Concurrent saves use separate live database sessions in one run. The freeze race proves the save reached a database lock before the freeze commits. The script printed `LOCAL_SQL_PASS 15` and `LOCAL_CLUSTER_REMOVED`. Evidence: `/tmp/workbook-preview-472-sql.log`.

Scoped lint, exit 0, zero warnings/errors:

```sh
node_modules/.bin/eslint src/lib/workbook-progress-source.ts src/lib/workbook-progress-source-store.ts src/lib/workbook-progress-source.fixture.ts src/lib/workbook-progress-source.test.ts src/lib/workbook-progress-source-store.test.ts src/lib/workbook-preview-record.ts src/lib/workbook-preview-record.test.ts src/lib/workbook-preview-store.ts src/lib/workbook-preview-server.ts src/lib/workbook-preview-server.test.ts
```

Scoped TypeScript command: `node /tmp/workbook-preview-472-typecheck.cjs`, exit 0, `ROOTS 9 DIAGNOSTICS 0`. The script uses this checkout's TypeScript and compiler options, disables incremental output and plugins, checks the five implementation entry files and four test roots, and follows their imports, including the new fixture. Evidence: `/tmp/workbook-preview-472-types.log`. Lint evidence: `/tmp/workbook-preview-472-lint.log`.

The type runner can be reproduced without a build:

```js
const ts = require(process.cwd() + '/node_modules/typescript');
const roots = ['workbook-progress-source.ts', 'workbook-progress-source-store.ts',
  'workbook-preview-record.ts', 'workbook-preview-store.ts', 'workbook-preview-server.ts',
  'workbook-progress-source.test.ts', 'workbook-progress-source-store.test.ts',
  'workbook-preview-record.test.ts', 'workbook-preview-server.test.ts'].map(f => 'src/lib/' + f);
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const program = ts.createProgram(roots, { ...parsed.options, incremental: false, plugins: [], noEmit: true });
const diagnostics = ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: () => process.cwd(), getCanonicalFileName: f => f, getNewLine: () => '\n',
}));
console.log('ROOTS', roots.length, 'DIAGNOSTICS', diagnostics.length);
process.exitCode = diagnostics.length ? 1 : 0;
```

`git diff --exit-code 4e07e83447750ce901e252a5ccb6f9e57b0a50c9 -- src/lib/workbook-progress.ts src/lib/workbook-progress-history.ts src/lib/workbook-progress-history-store.ts src/lib/workbook-progress-plan.ts src/lib/workbook-plan.ts src/lib/database.types.ts AGENTS.md` exited 0. `git diff --cached --check` exited 0 before the implementation commit.

Initial failures were resolved before the final checks. The first source run had 11 failures because the inherited synthetic package had no public answer check. The new fixture now has a valid sequence check; the validator was not weakened. The first type run found 8 generic-narrowing errors, then 2 fixture-type errors. Final diagnostics are zero. The first SQL run found an ambiguous PL/pgSQL variable/table alias; the corrected actual migration passed all 15 cases. A temporary diagnostic script aborted with exit 134 because `_compile` received no filename; the corrected diagnostic exited 0. A temporary count command had one syntax error; the corrected recount used the final JSON results. These failures are not acceptance evidence.

| Subsystem | What the local check proved | What it did not prove |
| --- | --- | --- |
| Source loading | Exact scoped pagination at API caps 1/37/100; old `56` retained without any photo source; required unmarked items; held days; foreign/missing/legacy/changing-source refusal. | Hosted PostgREST limits, historical automatic versions that were never retained, or a complete normalized cutoff history. |
| Existing history path | Public correction-unavailable refusal still applies. | Complete real second-try proof, step mastery, issued repeats, or a real next plan. |
| Serialization | Saved hashes/versions/scope validate; malformed or conflicting persisted truth refuses; restart uses saved inputs. | Hosted storage durability or a future engine's backward compatibility. |
| Server authorization | Live checked-seam ordering before source credentials; revoked Admin and failed Auth read refusal; retry skips source reads; denied saved read refusal. | Live Auth/RLS or a browser/route proof. Tests mock the existing Admin seam. |
| SQL | Actual new RPC, grants/RLS, actor checks, duplicate/conflict races, stale revision/delivery/manifest refusal, family/child fences, immutable update and child cascade. | Full-schema integration, hosted policies, deployed grants, or hosted deletion-worker proof. |
| Lint/types | The owned TypeScript entry files and imports compile and pass scoped lint. | Full application build, full suite or root's heavy admission gate. |

## Platform review and remaining root work

The repository has no separate platform-quirks file. The existing scan-marking reports and Supabase skill identify explicit grants, default function EXECUTE, empty security-definer search paths, RLS versus service BYPASSRLS, deletion fences and hosted proof limits. These were checked. The public [Supabase changelog](https://supabase.com/changelog.md), [database function documentation](https://supabase.com/docs/guides/database/functions), and [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) were read. The initial markdown fetch was unsupported by the web tool; direct public `curl` succeeded. The installed CLI is `2.118.0`; only its local `migration new` command was used. No hosted CLI command ran.

Root must perform these steps after review:

1. Obtain an independent review of this exact candidate. No child reviewer was started because this task required all work to run in the assigned agent.
2. Run local full-schema/platform checks as needed. The reduced schema is not full migration-chain proof.
3. Apply `20261107140215_workbook_preview_sources.sql` through the approved hosted process. Verify migration history and probe grants/RLS/family deletion with root-owned authorization. This migration remains unapplied.
4. Run `npm run db:types` after application. Add the generated-type-checked transport for `workbook_preview_command` to the isolated port. If generated arguments reject read-time null payload/hash values, use the repo's `NullArgs` correction in `database.ts`. Do not hand-edit generated types or add query type overrides.
5. Supply complete canonical frozen prior mastery/planning inputs, issued progress decisions, and version-bound second-try/fixed proof in a later approved slice. Do not substitute current profile aggregates, selected-step prefixes, parent changes, successful Maya calls or empty arrays.
6. Reuse `readWorkbookProgressHistory`, `deriveWorkbookProgress`, and `previewNextWorkbookPlan` when those sources are complete. Preserve `corrections-unavailable` until then. Resolve transactional source/snapshot admission in its assigned work.
7. Run root's serial heavy admission and full done gate. No full suite, build, Chromium, hosted proof, UI approval, release or print approval is claimed here.

Both implementation commits use the required legacy coauthor trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. It does not identify the actual implementation model. Local commits disable hooks so no unapproved heavy check starts. All owned checks completed. The SQL cluster was stopped and removed. No owned background process remains. The final report commit must leave status clean.
