# Workbook scan progress reader, #475

HANDOFF_READY

The bounded server reader is implemented and committed locally. This does not complete #475 or authorize release.

## Source and location

- Computer: `Savars-MacBook-Pro-5.local`.
- Prepared worktree: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-4ad9e5a0`.
- Physical worktree: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-4ad9e5a0`.
- Branch: `site/workbook-scan-progress-reader-475-mac`.
- Initial clean HEAD: `550fdcf1619c0e515e8ac33e2a65869d8c937af7`.
- Exact required base: `bb0f8d5d6896a3336d754c23821815f6d7a369bf`.
- Exact implementation HEAD: `8e0d2777455280c5830cafee4755d5b4eddb00bc`.
- Handoff commit: the final task reply supplies its exact SHA. It adds only this report.
- Actual model: Unify Codex `gpt-6.1-sol`, high reasoning effort, also called Unify Sol high.
- Required legacy trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The trailer does not identify the actual model.

The initial clean-tree and ancestry checks passed. Only this prepared checkout was fast-forwarded to the exact base. Only its branch was renamed. No checkout was created. No other checkout or PC project was changed. No subagent ran.

The source review included `AGENTS.md`, `docs/agents/delegate-brief.md`, the approved progress, clock and delivery modules and tests, the S8 history modules, the stored print contracts, database types, all three scan handoffs, the independent review, and the hosted schema record. The supplied issue JSON was read as spec data. The latest #628 instruction controls zero-scan HOLD. No real customer book, profile, revision or comments were read.

## Owned files

The implementation adds these four files:

- `src/lib/workbook-scan-progress-reader.ts`.
- `src/lib/workbook-scan-progress-reader.test.ts`.
- `src/lib/workbook-scan-progress-store.ts`.
- `src/lib/workbook-scan-progress-store.test.ts`.

This report is the fifth new file. No existing tracked file changed. The approved pure progress/clock modules, delivery functions, S8 history, routes, UI, email, migration, generated database types, print source, generator, templates, packages, plans and curriculum remain unchanged. No owned-file exception was needed.

## Public interfaces

`workbookScanProgressStore(db, deliveries?) -> ScanProgressStore` accepts the typed `SupabaseClient<Database>`. Its default delivery reader is the existing `workbookDeliveryStore(db)`. The optional delivery seam has only the public `DeliveryStore.receipt` method.

`ScanProgressScope` names exactly one parent, child and workbook. The adapter checks the parent exists with no deletion fence, the child belongs to that parent with no child-deletion row, and the exact workbook belongs to both. The book must be shipped and have a supported stored manifest and printed revision. All collection reads include parent and workbook filters. Tables that have child and printed-revision columns also use those filters. Receipt reads include the numbered-book filter. Every returned row is checked again. Page/question tables inherit child scope from the checked immutable workbook because those tables have no child column.

The adapter reads the stored manifest and exact page-number/page-ID mapping. Questions supply only their stored page identity and number, so the manifest can check the question-bearing page shape. No current template, schedule, teaching plan, package text or answer is loaded or reconstructed.

Receipt columns map explicitly to `AcceptedScanReceipt`. Event columns map explicitly to `AdmittedScanProgressEvent`. Each event has `resolvedItemIds: [item_id]` and must join its exact accepted `receipt_id` on the same page and scope. The result retains every accepted retake. The approved pure projection uses the accepted scan time for a resolving retake. A later `admitted_at` cannot move that anchor. An unchanged retake without a resolution event retains its receipt but does not move inactivity. Extra practice remains optional for required day sets.

`readWorkbookScanProgress(store, scope, now, history?)` feeds the existing `workbookScanProgress` projection. `now` must be a trusted server time. It returns either `{ status: "unavailable" }` or a compact server result with the numbered printed identity, `progress`, and `persisted`. Invalid scope or time does not call the store. An invalid book cannot produce an empty replacement progress state.

`ScanProgressHistoryReader` is an explicit canonical-history seam. Bind it to the checked parent's or admin's existing `readScanHistory` reader with the child/workbook filter, status `all`, limit 100, and the supplied cursor. Return `{ parentId, pages, after }` from that canonical result. Return null when history is unavailable. The reader follows all cursors, rejects repeated/nonadvancing keys and malformed results, and filters by exact parent, child, numbered book, printed revision, page ID and stored page number. If a later history read is unavailable, all partial review state is discarded. Missing history yields null `markingStatus` and null `reviewReady`.

The reader calls no private marking-completion policy. The approved projection uses canonical `HistoryPage` and `completedPage`. Completed marks cannot establish accepted scans, Day 7, a new-book claim or mastery. No photo query occurs. Image deletion or expiry cannot erase accepted progress.

`ScanProgressStore.recheck(scope, book)` repeats the live family/child/book checks and effective delivery comparison. The public reader calls it after history pagination. The adapter also checks for scope and delivery changes before returning a snapshot from its own `read` method.

## Delivery and durable state

The adapter reads each book's effective `DeliveryReceipt` through the existing public delivery store. It revalidates parent, child, workbook, number and correction identity. Another numbered book's receipt cannot supply an anchor. Missing delivery retains accepted scans and reports missing delivery. It creates no guessed delivery deadline.

The public result keeps current-runtime projection deadlines and readiness in `progress`. They are candidates only. `persisted` separately exposes these stored facts:

- `clock.status`: `missing-delivery`, `clock-required`, or `recorded`.
- `clock.deliveryAuditId`: the effective receipt/correction audit.
- `clock.requestPresent`: whether its durable clock request exists. A missing pre-migration request still reports `clock-required` for root recovery.
- `clock.calendar`: the stored deadline, clock version and record time for that exact effective audit.
- `claim`: the immutable winning reason, claim/effective times, delivery identity, nullable original deadline and captured receipt IDs.
- `claimCalendar`: a calendar joined by the claim's own audit, if one exists.
- `hold`: the effective delivery audit's stored zero-scan HOLD, if one exists. Older HOLD facts remain in storage.

A historical Day 7 claim can keep `backstopAt: null` permanently. A later calendar can appear beside it through `claimCalendar`. A later delivery correction changes the current calendar audit, not the historical claim. The tests deliberately use a persisted deadline that differs from the current-runtime projection. Both values remain separate. This reader performs no reconcile, calendar, claim, episode or queue write.

Zero accepted scans at the numbered book's 21-local-day boundary produce the approved projection's HOLD reason and no readiness candidate. A stored HOLD is exposed separately. Root owns the request for scans and all later application actions. This reader does not advance, repeat or queue a book.

## Pagination and resource limits

Pages, questions, receipts and events use ordered UUID keysets with batches of at most 500 and exact remaining counts. A short batch is not the end. The adapter continues to a counted empty tail. Remaining counts must decrease by exactly the retained batch. Missing counts, empty partial batches, changed totals, malformed keys, duplicate keys, descending/repeated cursors and HTTP failures stop the read.

Each collection is limited to 100,000 rows and 1,000 HTTP requests, including the empty-tail request. Exceeding either limit fails the whole read. It never produces partial progress. Canonical history is limited to 100 pages per read and 1,000 reads. It also fails at its bound. Singleton reads use unique workbook/audit keys and do not scan a history collection.

The long adapter test retains exactly 1,205 pages, 1,205 questions, 1,206 receipts and 1,205 progress events with a simulated server cap of 137 rows. It compares every retained receipt/event ID in order. Same-page retakes count as one accepted page. The canonical-history test reads all 1,205 `HistoryPage` records through the real public `readScanHistory` function and memory seam, in 13 reader pages. No progress count comes from a photo count.

## Checks

Falsifiers were stated before checks. Reject this result if a retained row is lost or duplicated, a foreign identity enters progress, admission time replaces scan time, missing history becomes ready, a corrected delivery rewrites a historical claim, or a current-runtime deadline replaces the stored calendar. A diagnostic, lint error or whitespace error blocks the local commit.

Dependencies were absent. This offline command installed the locked packages from the local npm cache. It ran no package lifecycle script and made no network request:

```sh
npm ci --offline --ignore-scripts --no-audit --no-fund
```

Final focused tests:

```sh
npm test -- src/lib/workbook-scan-progress-reader.test.ts src/lib/workbook-scan-progress-store.test.ts --maxWorkers=1
```

Result: PASS, 2 files, 69 tests. The earlier 56-test run passed before the added durable-state and resource-limit cases. No focused test failed.

Scoped lint:

```sh
./node_modules/.bin/eslint src/lib/workbook-scan-progress-reader.ts src/lib/workbook-scan-progress-store.ts src/lib/workbook-scan-progress-reader.test.ts src/lib/workbook-scan-progress-store.test.ts
```

Result: PASS, exit 0.

Scoped TypeScript used this exact command:

```sh
node <<'NODE'
const ts = require('typescript');
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const files = ['src/lib/workbook-scan-progress-reader.ts', 'src/lib/workbook-scan-progress-store.ts', 'src/lib/workbook-scan-progress-reader.test.ts', 'src/lib/workbook-scan-progress-store.test.ts'];
const program = ts.createProgram(files, {...parsed.options, noEmit:true, incremental:false, plugins:[]});
const diagnostics = ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, {getCanonicalFileName:f=>f,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));
console.log('SCOPED_TYPESCRIPT_DIAGNOSTICS', diagnostics.length);
process.exitCode = diagnostics.length ? 1 : 0;
NODE
```

Result: PASS, `SCOPED_TYPESCRIPT_DIAGNOSTICS 0`. The first source-only run found three null-narrowing diagnostics in the pagination helper. Changing its throwing helper to a function declaration fixed those diagnostics. No query type override or schema cast was added. The final program includes all four new root files and their imports with the repository compiler options.

`git diff --cached --check` passed before the implementation commit. A source search found no `overrideTypes`, `returns<T>`, `maybeSingle<T>` or em dash in the four implementation files. Runtime: Node 22.23.1, ICU 78.2, tz 2026a.

## Proof and limits

- Scope: tests prove explicit query filters, returned-row checks and final family/child/delivery rechecks through synthetic HTTP and memory seams. They do not prove hosted authorization or deletion behavior.
- Pagination: tests prove retained IDs, full counts, stable keysets and refusal of malformed/incomplete answers through the actual typed Supabase client. They do not prove a transaction snapshot across separate HTTP reads.
- Admission: tests prove explicit durable receipt/event mapping and exact joins. They pass through the independently approved SQL admission contract. They do not run quality, calibration, S4/S5 or a real photo save.
- Marking: tests prove canonical history states remain separate from acceptance. They pass through the existing completion rule. They do not run a recognition model or rebuild a profile.
- Delivery/calendar: tests prove the existing public delivery reader supplies the effective receipt and that persisted audits/deadlines/nullable claims remain separate. They do not run hosted confirmation, correction, scheduler or clock writes.
- Output: tests prove the public progress result excludes the canonical child's name and photo metadata. The adapter reads no package/answer/photo bytes. Root still owns the parent-summary response boundary and route authorization.

The checked caller must authorize its live session before selecting this service-reader scope. Service credentials alone do not authorize the end user. The result is a server contract, not an endpoint response. The reader uses immutable fact tables with drift checks and final fences. It does not lock the family or establish a single database snapshot. Later events can become visible on a later read. Durable decision admission remains in the approved database core.

Root retains independent Sol review, complete integration, actual scheduler/delivery callbacks, due-book/backfill recovery, latest-book inactivity selection, episodes/emails/UI, hosted permission/deletion probes, the full gate, push, PR and merge. No full suite, application build, browser, Chromium, generator, model, paid call, service connection, credential read, migration application, type generation, customer action, push, PR, merge or watch ran here. The customer workbook remains frozen. No print approval exists.

No long-running process or scratch file was created. The local npm dependencies remain ignored in this prepared checkout. Root can replace `HANDOFF_READY` after it consumes the result.
