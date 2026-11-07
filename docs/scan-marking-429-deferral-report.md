IMPLEMENT_DONE_429_DEFERRAL

# Scan marking HTTP 429 deferral implementation

Implementation source HEAD: `3197282a2c8ce26eb4104194a281eecca8100b75`.
Base: `1da5dfaf47bfe36bd6a0b7930e41c258d4453630`.
The following documentation-only commit adds this report. The final handoff identifies that commit separately.

- Machine: `Savars-MacBook-Pro-5.local`.
- Branch: `site/scan-marking-rate-deferral`.
- Physical checkout: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-607e7c74`.
- Prepared checkout address: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-607e7c74`.
- Source ownership: isolated Mac checkout. No PC task or child agent was started.

## Behavior

`clean429-v1` is an explicit immutable plan field. It changes the plan hash without changing the prompt, schema, 13 endpoint pins, or photo inputs. The production prompt remains `whole-page-scalar-readings-v6`. Global concurrency and per-model concurrency are both one.

The transport captures HTTP status, raw body, parsed envelope and OpenRouter metadata. Both HTTP status and error code must be 429. A message is required. Generation, usage and choices fields invalidate the exception, including nested fields and JSON stored in upstream metadata. A label has no authority. SQL independently validates this same evidence against the reserved run, attempt and dispatch IDs.

A validated clean 429 defers only that model. Its original reservation stays charged at its full held amount in every cap calculation. The other initial model passes continue. At the end of the initial pass, the model receives one final batch for its missing photos. Its saved response time supplies the 900,000 millisecond deadline. Each final request has a distinct key and reservation. Another clean 429 stops that model. It cannot receive a third batch.

Known-usage schema-invalid and invalid-JSON responses remain real failed observations. They are not missing photos or final-batch targets. Clean 429 attempts do not add accuracy, schema or unsure failures. Missing photos still prevent completeness. Reports keep measured cost and held liability separate. Unknown cost cannot supply an exact cost per page or win the cheapest measured passing selection.

The CLI waits in intervals of at most 30 seconds. Before each wait it saves the model, deadline, policy and current held liability. A terminal journal snapshot can restore a missing or older result file from this same run. It retains both attempts, the first hold and the retry deadline. Duplicate, orphan, copied and mismatched run records stop recovery.

The additive migration adds an RLS table with a service-only read policy and a validated service-only write RPC. Foreign keys restrict deletion. No family FK is added. The checked reserve retains the global advisory lock and delegates all bound, price, pixel, immutable run, USD 15 run, USD 50 UTC-month and USD 50 lifetime checks to the original reserve. Every cap retains `coalesce(charged_micros,reserved_micros)`. Classification performs no settlement. Unclassified unknown liability still stops checked admission across runs.

## Changed paths

1. `src/lib/scan-marking-comparison.ts`: policy identity, captured evidence, persisted attempt fields, strict recovery and reports.
2. `src/lib/scan-marking-comparison-run.ts`: classification, counted holds, serial final batches, deadline waits and terminal snapshots.
3. `scripts/scan-marking-comparison-cli.ts`: plan identity, service RPC adapter, journal filename checks, recovery and reports.
4. `src/lib/scan-marking-comparison.test.ts`: public fake transport, journal, budget and clock checks.
5. `supabase/migrations/20261107015353_scan_marking_evaluation_clean429.sql`: prepared additive classification migration.
6. `supabase/tests/scan_marking_evaluation_clean429.cjs`: local SQL controls.
7. `docs/scan-marking-comparison.md`: operation and recovery rules.
8. `docs/scan-marking-429-deferral-report.md`: this report.

All shared type consumers in `src/` and `scripts/` were searched before the changes. The comparison types have consumers in the comparison runner, CLI, comparison tests and selection tests. The existing optional fields preserve measured historical fixture types. This does not admit historical results into a new run.

## Verification

Final focused test command:

```bash
node_modules/.bin/vitest run src/lib/scan-marking-comparison.test.ts src/lib/scan-marking-selection.test.ts --maxWorkers=1
```

Result: 2 files passed, 123 tests passed. The comparison file has 112 tests. The selection file has 11 tests. Final duration: 19.65 seconds.

The tests would fail if a clean 429 stopped another model, released a hold, caused an immediate retry, crossed the deadline early, repeated a final request, received a third batch, erased a schema failure, accepted a copied run, or lost raw evidence after a later fault. These inputs are binding: several models defer, two full holds reach the exact aggregate cap, the clock resumes one millisecond before the deadline, and a final request completes before its result file write is interrupted.

- Transport: proved raw HTTP classification, no invented usage, exact request identity for all 13 pins, separate retry reservation and evidence retention. Passed through the production public marking request and parser with fake HTTP responses.
- Matrix: proved serial requests, other-model continuation, separate model deadlines, one final batch, second-429 stop, cap accounting and partial final-batch recovery. Passed through injected clocks and waits; no real 15-minute wait occurred.
- Journals: proved terminal-snapshot recovery and safe rejection at starting, reserved, response and nonterminal deferred boundaries. Passed through memory journals; the existing exclusive file journal test also passed.
- Reports: proved fixed D267 item counts, no 429 schema or accuracy penalty, persistent schema failures, actual tested-photo counts, separate held and measured amounts, and exclusion from cheapest selection while cost remains held. Passed through synthetic labelled observations.
- SQL: proved the actual migration on disposable local PostgreSQL, including two-session races and role checks. It does not prove hosted permissions or hosted application.

Focused TypeScript passed with `/tmp/scan429-tsconfig.json`. It extends this checkout's `tsconfig.json`, disables incremental output and includes the two comparison source modules, CLI, comparison tests and selection tests. Its transitive imports use the existing source. No official database type file was edited.

```bash
node_modules/.bin/tsc -p /tmp/scan429-tsconfig.json --pretty false
node_modules/.bin/eslint src/lib/scan-marking-comparison.ts src/lib/scan-marking-comparison-run.ts src/lib/scan-marking-comparison.test.ts scripts/scan-marking-comparison-cli.ts
node --check supabase/tests/scan_marking_evaluation_clean429.cjs
git diff --check
```

All four final commands passed. An earlier plain repository `tsc --noEmit` attempt was too broad. It found missing generated Next.js route/image declarations in this fresh checkout and one local closure-narrowing error. The local error was corrected. The focused TypeScript command then passed. No build or Next.js type generation ran.

## Prior-source falsifiers

The focused continuation test was also run with `scan-marking-comparison-run.ts` from the exact base commit. A temporary Vitest alias selected that prior source without changing a parent checkout. It failed with `unknown-usage-stopped-run-no-blind-retry`. The candidate passed the same test.

```bash
git show 1da5dfaf47bfe36bd6a0b7930e41c258d4453630:src/lib/scan-marking-comparison-run.ts > /tmp/scan429-prior-run.ts
node_modules/.bin/vitest run --config /tmp/scan429-prior.config.mjs -t 'defers only its model, counts the hold' --maxWorkers=1
```

The temporary config aliases `@/lib/scan-marking-comparison-run` to `/tmp/scan429-prior-run.ts`. Its other `@` imports resolve to this checkout's `src`. This is a prior-runner control, not a full prior-tree test. The SQL probe also exercises the old checked RPC before it applies the new migration. The old RPC returns `unresolved-evaluation-cost` for the same bounded unknown hold. The new classification permits the following reservation while the full holds remain counted.

## Local SQL commands and counts

The recorded disposable instance used only a Unix socket. TCP listening was disabled. No hosted URL or credential was supplied.

```bash
initdb -D /tmp/pd542-pg-429-PtVbLT/data --auth=trust --no-locale --encoding=UTF8
pg_ctl -D /tmp/pd542-pg-429-PtVbLT/data -l /tmp/pd542-pg-429-PtVbLT/postgres.log -o '-k /tmp/pd542-pg-429-PtVbLT -p 55439 -c listen_addresses= -c shared_buffers=16MB -c max_connections=10' start
createdb -h /tmp/pd542-pg-429-PtVbLT -p 55439 pd542_429_deferral_r2
SCAN_MARKING_SOCKET=/tmp/pd542-pg-429-PtVbLT SCAN_MARKING_DATABASE=pd542_429_deferral_r2 PGPORT=55439 node supabase/tests/scan_marking_evaluation_clean429.cjs --bootstrap
pg_ctl -D /tmp/pd542-pg-429-PtVbLT/data stop -m fast
```

Result: `SCAN_MARKING_CLEAN429_SQL_OK 23 cases`.

The 23 cases cover classification versus unknown liability; 12 malformed or disallowed evidence forms; run/attempt/dispatch ownership; concurrent duplicate classification; conflicting evidence; rollback; concurrent checked reservation; distinct retry reservation; exact run cap; cross-run unknown liability; exact UTC-month and lifetime boundaries; explicit later settlement; RLS; browser denial; service direct-write denial; and restricted ledger deletion. Several controls share one named case.

An initial local run found that the test service role had no BYPASSRLS attribute. The migration now includes an explicit service-only SELECT policy. A new disposable database then passed all 23 cases. The server was stopped before handoff.

## Proof limits and root work

An interruption before a terminal journal snapshot remains a safe stop. It cannot grant a retry. Root must reconcile a starting, reserved, response or nonterminal deferred journal before more paid work. This preserves the requirement that uncertain accounting and journal outcomes remain fatal. Terminal result-file gaps, saved waiting states, successful partial final batches and second-429 stops resume without duplicate requests or timer resets.

The tests use fake HTTP and local SQL. No model or subscription was called. No credentials, Keychain entries, private account fields or old result bodies were read. No old response was copied or relabelled. No hosted write, print change, flag change, privacy change, held-642 change, full test suite, build, Chromium run, push, PR or merge occurred.

Root owns the independent Sol review, hosted migration application, official database type generation, final full gate, billing reconciliation and the new immutable all-13-model run on the fixed 40 photos. Root must report historical schema failures separately. These local checks establish no model accuracy, real handwriting accuracy, hosted acceptance or release approval.

## Review R1 repair: report metrics after a saved block

Review R1 found that a resumed blocked model lost its failure and schema metrics. The report now selects that model's retained, pinned evidence referenced by its stored results when the saved state has no ready evidence. It preserves all measured metrics across a saved block, run reload and report reload. The model remains blocked, incomplete, not passed and ineligible for a measured-cost winner.

A new public report control fails before the repair and passes after it. The actual CLI regression from the review also passes: the schema failure stays counted after file-journal recovery and repeated report loading. The full focused set passes124tests across two files. The separate actual-CLI regression passes one test; three unrelated controls are not selected. Focused types and changed-code lint pass. The migration, held amounts, raw-response classification, timing, retry and reservation code are unchanged. Hosted application remains pending.

## Hosted verification and official types

The reviewed migration was applied to project `cdjobwsyzndtltzfpyqa` as `20261107023312_scan_marking_evaluation_clean429`. Its source SHA256 is `11cec978fc2594fc7fa623280e20d76180cd613060001ada93c47eb33baa26c5`. The hosted rollback probe returned `HOSTED_CLEAN429_ROLLBACK_OK`. It checked browser/service privileges, restrictive foreign keys, the unknown-cost stop, rejection of usage-bearing errors, idempotent classification, unchanged full holds, the held run cap and complete fixture rollback. It left38actual attempts, zero deferrals, zero unknown holds and58629charged microdollars.

Hosted RLS is on with one service-read policy. The service HTTP RPC returns200 and refuses invalid classification; the service table read returns200 with zero rows. SQL effective-privilege checks deny browser reads and direct service writes. A real authenticated browser was not used for this accounting table. Security advisor notices remain unchanged at three grouped notices. No provider call or family admission changed.

`npm run db:types` regenerated the official file, adding66lines for the table and functions. No type declaration was edited by hand. The root proof, HTTP status/size observations and rollback SQL are retained in `first-customer-marking-20261106/comparison/429-deferral/hosted/` outside the repository. Independent review covers runtime9d73a291; the later root commit adds official generated types and this evidence only.
