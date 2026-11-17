# Historical AI export evidence

HANDOFF_READY

Implementation date: 2026-11-16 in Vancouver, 2026-11-17 UTC.
Computer: `Savars-MacBook-Pro-5.local`.
Branch: `site/ai-cost-history`.
Base: `7c70f3022463638ae12174413fdd55117d3f06ca`.
Worktree: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-fe543b7d-b274d873f7e2fcd4`.
Prepared path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-fe543b7d-b274d873f7e2fcd4`.

The implementation is ready for Root's review and hosted work. It is not release proof.
The worker used synthetic inputs only. The worker did not read private CSV files, app
snapshots or credentials. It made no provider request, hosted write, source import,
configuration change, push, PR or deployment. It started no children.

## Scope

- `src/lib/ai-cost-history-package.ts` validates the full offline package and controls ingestion.
- `scripts/import-ai-cost-history.mjs` is the operator entry point. The default is a dry run.
- `supabase/migrations/20261117030145_ai_cost_history.sql` adds three private tables and explicit RPCs.
- `src/lib/ai-cost-history-store.ts` reads with the verified admin session.
- `src/components/admin-ai-cost-history.tsx` uses the existing B panel components.
- `/admin/ai?report=records` mounts the closed section. Other reports make no historical read.

The new storage does not insert into or change `ai_usage_events`, older spend tables,
or `openrouter_provider_receipts`. Their existing ingestion and readers are unchanged.
Historical amounts do not enter ordinary billed or app totals.

## Package contract

Root must prepare a private controller manifest. Do not commit it or the source files.
Use the exported `HistoryManifest` interface as the schema. Use `inspectHistoryCsv(bytes)`
to obtain the row counts, exact known-cost sum, unknown-cost count and retained-row hash.
Use `historyHash(bytes)` for source and snapshot hashes. Remove the returned `rows`
property from the manifest. Do not print those rows.

The controller must supply these recorded facts:

- A new export UUID. Keep it fixed for every retry of that package.
- Version 1, parser `openrouter-logs-csv-v1`, source kind `openrouter_logs_csv` and the fixed Unica workspace from code.
- Workspace basis `controller_recorded_export_procedure`. This is not row-level workspace proof.
- Source SHA-256, exact byte size and the exact ordered header list `HISTORY_HEADERS`.
- The computed summary from `inspectHistoryCsv`: `source_row_count`, `row_count`,
  `distinct_generation_count`, `known_cost_usd`, `unknown_cost_count`, `rows_sha256`.
- The recorded selection control `This Year` and its exact UTC selection bounds.
  Bounds are metadata. They do not establish row event times.
- The controller verification time as canonical UTC text with milliseconds.
- `captured_at: null` and `row_time_zone: null`. Both remain unknown.
- `analytics.total_usd` as its original decimal string, its separate `request_count`,
  and an ordered list of snapshot SHA-256/byte-size bindings.

The analytics request count must equal the distinct source generation count. Snapshot
bytes must match every binding. The validator does not extract facts from a screenshot
or infer a workspace from an ID. The controller owns the snapshot total/count and the
recorded export procedure. It must review these against its actual evidence.

The parser accepts RFC 4180 quotes, doubled quotes, quoted newlines, CRLF, LF and a UTF-8
BOM. Hashes bind original bytes. It rejects unsupported headers, malformed records,
invalid UTF-8, unsafe fields, invalid IDs, invalid calendar dates and invalid decimals.
Exact duplicate source records count once in the evidence set. Their original record
positions remain available through `source_row_number`. A conflicting duplicate fails.
The source record count still includes exact duplicates.

Retained fields are exactly `HISTORY_FIELDS`. User, location, user-agent, app, response
and variant fields are dropped before the evidence set is made. Credential-looking
key labels fail validation. Safe labels remain labels. They are not key IDs or product
identity. Blank accounting fields remain null. Explicit zero remains text zero.
Negative cache amounts are allowed. Negative total costs fail. Search, cache, file
and BYOK amounts are never added to `cost_total`.

Accepted decimal inputs use plain base-10 text, at most 12 integer digits and 30
fraction digits per source field. Exponents, padded integer forms and non-finite
values fail. The exact sum allows 18 integer digits. Numeric storage has no rounding
scale. Each original decimal string remains in the immutable evidence JSON.
Counts are bounded to 250,000 source records. Each source or snapshot file is at most
50 MB. The manifest file is at most 32 KiB. A package has one to eight snapshots.
These limits fail validation. They never truncate source data.

```sh
node scripts/import-ai-cost-history.mjs --csv PRIVATE_CSV_PATH --manifest PRIVATE_MANIFEST_PATH --snapshot PRIVATE_SNAPSHOT_PATH
```

Repeat `--snapshot` in manifest order. A dry run validates the entire package and makes
no database request. It prints a row count only. After review and hosted verification,
Root may add `--apply`. Only the apply path reads `SUPABASE_SECRET_KEY` from the process.
No environment file is loaded. The target project URL is fixed in code. If
`SUPABASE_URL` is set, it must equal that fixed URL. There is no alternate target flag.

## Storage and retries

The manifest, row evidence and completion marker have separate append-only tables.
The three tables have RLS and no direct grants to anonymous, authenticated or service
roles, including TRUNCATE. The functions use an empty search path and explicit grants.
Only the service role can begin, ingest or finalize an import. Only an authenticated
admin can call the reader. No parent read policy is present.

`begin_ai_cost_history` stores the immutable manifest. A changed manifest with the same
UUID fails, including a change while the import is pending. Row batches contain at
most 128 records. Exact retries are no-ops. A conflicting batch fails atomically.
Begin, batches and finalization acquire the same manifest row lock. Finalization checks
the complete sequence, source record order, distinct generations, unknown-cost count,
exact sum and hash of every retained field. It then appends a completion record.
No partial export is visible. A lost completion response can be retried safely.
Completed evidence cannot change. A failed command returns nonzero and claims no success.
Keep the original package unchanged until the import is verified.

## Admin behavior

The reader has a five-second HTTP deadline and uses no service key. A failed or malformed
read shows unknown historical evidence without hiding ordinary reports. Invalid,
missing and incomplete explicit selections never fall back to another export. With
no selection, the latest completed export is shown. It lists at most 50 completed
exports and reports omitted exports. A valid older UUID can still select an export
outside that list. Exports are never combined.

Models, safe key labels and current feature/family/child groups are shown for the
selected export. Each breakdown has at most 1,000 groups and reports omissions. Totals
cover the entire export. Technical details shows the manifest and the first 100 safe
evidence rows, with the omitted row count. Source IDs, timestamps, source hashes and
component amounts remain there. Native disclosures start closed. The section reuses
the existing Table, Tiles, SectionHead, Empty, admin tokens and technical-details styles.
No new design direction or CSS system was introduced.

Ownership joins use only `provider = openrouter` and exact generation ID. The join
aggregates matches before it joins source rows, so multiple app rows cannot multiply
amounts. More than one app match or evidence of a different canonical workspace
suppresses attribution. It never infers a child from a family. Family and child names
come from current rows, and a child must belong to the matched parent. Deleted app or
family data leaves the source amount intact and its ownership unknown.

## Checks

Before the focused checks, the worker stated the failures each check could expose.
The final focused run passed 75 tests in six files in random order with seed 1714:

```sh
npx vitest run src/lib/ai-cost-history-package.test.ts src/lib/ai-cost-history-store.test.ts src/lib/ai-cost-history-route.test.ts src/lib/ai-cost-history-cli.test.ts src/components/admin-ai-cost-history.test.ts src/components/admin-ai-usage.test.ts --maxWorkers=2 --sequence.shuffle --sequence.seed=1714
node supabase/tests/ai_cost_history.mjs
npm run typecheck
npx eslint 'src/app/(product)/admin/ai/page.tsx' src/components/admin-ai-usage.tsx src/components/admin-ai-cost-history.tsx src/components/admin-ai-cost-history.test.ts src/lib/ai-cost-history*.ts scripts/import-ai-cost-history.ts scripts/import-ai-cost-history.mjs supabase/tests/ai_cost_history.mjs
```

- Package/CLI tests prove full-file validation, hashes, privacy filtering, exact
  decimal text, blank/zero/cache distinctions, duplicate handling, default dry run,
  bounded import restart and generic failures. Transport tests pass through fakes.
- Route/store tests prove the admin-boundary order, Records-only reads, fixed target,
  selected-export handling and independent failures. They do not prove hosted sessions.
- Component tests prove closed disclosures, exact source labels, unknown states,
  selection links and technical-data placement in server-rendered HTML. They do not
  prove browser layout, keyboard use or responsive behavior.
- The SQL probe uses a new disposable local PostgreSQL cluster. It proves service/admin
  privileges, no direct table grants, append-only refusal, interrupted imports,
  conflicting-batch rollback, concurrent batch/finalization, completion retries,
  same-total content hash failure, separate overlapping exports, exact current
  attribution, no row multiplication, deletion behavior and actual limit counts.
  It checks unchanged nonzero synthetic app, older-ledger and canonical totals before
  and after the migration and historical import. It also inserts a later richer
  canonical receipt for a CSV generation through the existing canonical RPC.
  It does not prove hosted permissions or actual provider delivery.
- The typecheck generates Next route types and checks TypeScript. Changed-file lint
  passed. Neither replaces the required full build.

The first checks found a missing Vitest package in a reused dependency path, a test
assertion that matched the generic word `private`, test type errors, and CommonJS probe
lint errors. The worker installed the lockfile dependencies in this isolated worktree,
corrected the tests and used an ES module probe. The final checks above passed.

## Root gates

1. Review the fixed implementation commit independently. The worker has not done an independent review.
2. Check current hosted migration history, dependencies and timestamp uniqueness. The local
   timestamp was generated in UTC and had no local or `origin/main` collision. The worker
   did not read hosted history. Do not replay the migration folder.
3. Apply the additive migration with the documented Supabase MCP process. Verify the
   applied name/version, empty search paths, RPC privileges, RLS and append-only rules
   against hosted behavior. Repeat rollback-only synthetic concurrency/completeness,
   non-admin refusal, unchanged ordinary totals and later richer canonical receipt probes.
4. Run `npm run db:types` and `npm run db:checks`. Commit generated outputs. The worker
   did not edit generated files. Register state checks only where the generated schema
   and the repository's state-list rules require them.
5. Prepare the actual private package from the controller's evidence. Confirm its
   source counts and exact source/analytics amounts. Preserve the unresolved difference.
   Do not treat old app-match counts as current expected values. Run the dry run first.
   Root owns credentials, the real import, verification and retention of private inputs.
6. Run the unrun full gate: `npm test && npx eslint src && npm run build`.
7. Check the Records section in the browser with `npm run dev`, including empty, failed,
   selected, missing, long-label, mobile and keyboard states. Test normal reports after
   a historical read failure. Check closed Technical details and exact decimal wrapping.
   No browser layout proof was produced by this worker.
8. Root owns push, PR, release and hosted page verification. Record verified results and
   remaining limits in the Unica vault notes. Keep source data out of commits and reports.
9. Change `HANDOFF_READY` to `HANDOFF_DONE` only after integration and the required gates.
