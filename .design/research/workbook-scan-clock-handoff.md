# Workbook scan clock for #475

HANDOFF_READY

The local SQL candidate now consumes the canonical server deadline. This does not complete #475 acceptance. The migration is still unapplied. Root must implement the server adapter and recovery loop before release.

## Source and location

- Computer: `Savars-MacBook-Pro-5.local`.
- Prepared worktree: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-7a8308f3`.
- Physical worktree: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-7a8308f3`.
- Branch: `site/workbook-scan-clock-475-t3-7a8308f3`.
- Initial clean HEAD: `550fdcf1619c0e515e8ac33e2a65869d8c937af7`.
- Exact required base: `542e4a5baf828d4b43e9f0b0e7231a40ad71afd7`.
- Exact implementation head: `666ab0f77accd9de5d6eca182ff38e3f4bee814b`.
- Handoff documentation commit: the final reply supplies its exact SHA. That commit changes only this file.
- Actual model: Unify Codex `gpt-6.1-sol`, high reasoning effort, also called Unify Sol high.
- Required legacy trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. It does not identify the implementation model.

The clean check and ancestor check passed before the exact fast-forward. Only the prepared branch was renamed. No other checkout changed. No checkout was created. No subagent started.

Read sources included the complete receipt handoff, `AGENTS.md`, `docs/agents/delegate-brief.md`, the actual family-time and delivery exports, the existing SQL RPCs and fences, and the saved issue JSON. The JSON was read as data. The supplied latest #628 instruction takes precedence over the saved issue's older zero-scan rule: zero accepted scans at the deadline means HOLD book 2 and ask for scans. It creates no next-book claim, plan advance, repeat or queue action.

## Files

- Revised `supabase/migrations/20261106224500_workbook_scan_receipts.sql` in place.
- Revised `supabase/tests/workbook_scan_receipts.cjs`.
- Added this handoff.

The existing fixture file is unchanged. Shared application clocks, browser code, delivery and scan RPC bodies, grants of existing RPCs, print source, time-zone rules and Node configuration are unchanged. A PostgreSQL catalog test compares all pre-existing loaded public function definitions and ACLs before and after candidate installation.

## Chosen clock contract

The three candidate SQL calendar helpers are removed. PostgreSQL no longer computes the backstop from its native time-zone database. No special Edmonton offset exists in the SQL.

`workbook_scan_clock_requests` is an immutable request for one exact effective delivery audit. It stores the numbered workbook, frozen printed revision, parent, child, correction ID, delivered instant, zone and override mode. Delivery and correction AFTER hooks create the current request through the same claim helper. Reconciliation creates requests for effective deliveries that predate the migration. Requests have no photo dependency.

`workbook_scan_delivery_calendars` stores the first approved server deadline for that request's audit. Its source is `deliveryDeadlines` from `src/lib/workbook-delivery.ts`, which calls `family-time.ts`. A non-empty `clock_version` identifies the reviewed source/runtime. The server must compute from the saved request's `delivered_at`, `time_zone` and `zone_override`. Do not recompute delivery from `local_time` or a browser clock.

The calendar write acquires the existing family fence, book KEY SHARE lock and per-book advisory gate. It then reads the effective receipt and latest correction again. The audit, delivered instant, zone and override mode must all equal the supplied saved identity. A correction that wins this lock race makes the old response return `stale-delivery`. It inserts no obsolete calendar and creates no obsolete decision. A calendar that wins first can create the claim. A later correction cannot rewrite that claim.

An identical retry preserves the calendar row and its `recorded_at`. A changed deadline or version for the same current audit returns `calendar-conflict`. No update occurs. A later correction gets its own request and calendar. A retry for an audit that is no longer effective returns `stale-delivery`, even if that older calendar already exists.

The service key is the trust boundary for the computation. SQL checks finite minute-aligned output after delivery. It cannot independently prove the local-calendar calculation without reintroducing the divergent clock implementation. No browser or authenticated admin can supply a calendar through the new RPC. No public caller can supply the current decision time. The existing private test clock remains owner-only.

## No lost admission while a calendar is missing

Day 7 depends on the full frozen scan set and confirmed delivery. It does not depend on the backstop deadline. Its final receipt still claims atomically, even when the server has not yet supplied a calendar. Delivery confirmation still re-evaluates receipts that arrived first. Ordinary and test books keep their full required sets.

For a Day 7 claim, `backstop_at` can be NULL if no calendar existed when it won. This is an intentional schema change. Never invent a SQL deadline to fill it. Never update the immutable claim later. A reader can join the calendar by the claim's `delivery_audit_id` if that calendar is later recorded. If a correction wins before the old calendar is recorded, that old Day 7 claim can retain NULL permanently. The deadline was not part of its admission decision. The current corrected delivery has its own request and deadline.

Without a calendar and without Day 7, reconciliation returns `clock-required` and `deliveryAuditId`. The request is durable. No HOLD or backstop claim uses a guessed time. Recording the calendar calls the claim helper again under the same gate, with a fresh database clock after lock waits. An overdue request therefore becomes a HOLD or a backstop claim without another scan or scheduler invocation. A late backstop claim keeps the canonical deadline as `effective_at` and the actual admission time as `claimed_at`.

`list_workbook_scan_clock_requests` returns only current, missing calendars. It excludes old correction audits, frozen families and child tombstones. Old requests therefore cannot fill every recovery batch. A correction can still occur after the read; the write's comparison handles that race.

This is durable recovery, not an autonomous SQL scheduler. Root must run the bounded server recovery path. Until root does that, a missing calendar delays the backstop. Day 7 continues. Do not accept or release this SQL candidate alone.

## Exact service adapter signatures

```sql
public.list_workbook_scan_clock_requests(p_limit integer) -> jsonb

public.record_workbook_scan_delivery_calendar(
  p_book uuid,
  p_delivery_audit bigint,
  p_delivered timestamptz,
  p_zone text,
  p_override boolean,
  p_backstop timestamptz,
  p_clock_version text
) -> jsonb

public.reconcile_workbook_scan_progress(p_books uuid[]) -> jsonb
```

Only `service_role` can execute the two new adapter RPCs. The read limit must be 1 through 100. The existing reconcile limit remains 100 distinct book IDs per sorted batch. Existing admin reconciliation remains checked and cannot supply the clock.

The list result is an array of the saved request's snake-case columns. The record result is the normal single-book claim result (`waiting`, `hold`, `claimed`, `missing-delivery` or `unavailable`), or `stale-delivery` / `calendar-conflict`. Invalid finite/range/minute/version input raises `invalid_scan_calendar`. Invalid read limits raise `invalid_scan_clock_batch`.

The root server adapter must perform these steps:

1. Call reconciliation for the bounded relevant delivered books. This also creates missing requests for pre-migration deliveries.
2. Read a bounded current request batch with `list_workbook_scan_clock_requests(100)`.
3. For each request, use `timeZone = zone_override ? time_zone : { zone: time_zone, override: false }`.
4. Compute `deliveryDeadlines({ deliveredAt: delivered_at, timeZone }).backstopAt` using the real exported helper on the trusted server. Its implementation only reads these two receipt fields.
5. Call the record RPC with the exact saved audit, instant, zone and override mode, plus that deadline and the reviewed source/runtime version.
6. On `stale-delivery`, read the current request again. On `calendar-conflict`, retain the first record and report the conflict. Do not overwrite or silently retry with a changed clock version.
7. Recover the same pending requests after a timeout or process restart. Continue the regular due-book reconciliation for already recorded future deadlines.

Run this path after delivery confirmation/correction and during scheduler recovery. A delivery response lost before its adapter call leaves a request for recovery. A calendar response lost after commit leaves the immutable first record and decision. No browser deadline or `p_at` field belongs in an API request.

## Preserved contracts

Accepted receipt admission, durable image-independent history, S4/S5 owner/version behavior, cutover refusal for pre-install photos, optional valid work, full ordinary/test Day 7 sets and one unique claim per numbered workbook remain intact. A zero-scan HOLD consumes no claim. A later scan can qualify normally. There is no plan, billing, profile, queue, email or customer-book write.

The new tables have RLS, checked admin SELECT and service SELECT only. No external role has direct INSERT, UPDATE, DELETE or TRUNCATE. The common immutable-fact trigger refuses UPDATE. Both tables have the existing family and child fences and identity cascades. Family and child deletion tests cover the new rows. The service calendar function also runs the family/child checks before reading or recording a clock.

All claim paths retain book KEY SHARE before the per-book gate. Delivery retains its existing book UPDATE order. No new photo, calibration or item row lock occurs after the gate.

## Checks and evidence

Falsifiers were stated before execution. The local runner used real PostgreSQL 18.6 processes and sessions. It loaded the production public scan/save/calibration/S4/S5/delivery/correction RPCs and candidate hooks. Its clock module bundled the actual exported `deliveryDeadlines` and `family-time` code in memory with esbuild. No copied clock algorithm supplied an expected result.

Commands:

```sh
npm ci --ignore-scripts --no-audit --no-fund --cache node_modules/.cache/npm
node --check supabase/tests/workbook_scan_receipts.cjs
node supabase/tests/workbook_scan_receipts.cjs
git diff --check
```

Local runtime: Node `v22.23.1`, ICU `78.2`, tz `2026a`. The diagnostic-only `NATIVE_TZDATA_PARITY` path is gone. The fixed Edmonton checks now require:

- `2026-10-15T12:00:00Z`, explicit override false: `2026-11-05T13:00:00.000Z`.
- The same instant, override true: `2026-11-05T12:00:00.000Z`.

The final source has 34 test groups. The 20 binding clock cases split into 10 override-false and 10 override-true cases. Zone counts are Chicago 6, Edmonton 2, Vancouver 4, Winnipeg 2, Yellowknife 2, Kolkata 2, and UTC 2. Each compares the persisted deadline to the real helper and checks returned decisions at one millisecond before, exactly at, and one millisecond after the deadline. Gap and fold results are fixed assertions too. The record RPC can itself create an overdue HOLD before those deterministic boundary probes; the separate future-minute test checks the real admission time.

New groups prove immediate Day 7 without a calendar in both delivery orders for ordinary/test books; missing-calendar recovery with and without scans; unchanged first-write/retry state and conflict refusals; correction versus clock response in both lock orders; final receipt, calendar and scheduler races; bounded recovery filtering; a real clock boundary after a lock wait; and family/child refusal of calendar writes.

The real minute test used the canonical deadline `2026-11-06T21:23:00.000Z`. The service transaction began before that deadline and waited at the book gate. The lock was released after the deadline. The service record RPC then admitted a HOLD with `held_at >= backstop_at` and no trigger claim. It did not use the transaction-start clock.

Each concurrent test ran the competing paths in the same run. Explicit `pg_blocking_pids` barriers established the intended wait order. The calendar/final-receipt/scheduler test used three sessions and passed both orders. The first winner remained the only claim.

Final result:

```text
WORKBOOK_SCAN_RECEIPTS_OK 34
PROOF receipt: production hooks/RPC admission and durable rows; synthetic image quality/Storage metadata only.
PROOF marking: production S4/S5 versions and publication; no model, learning-event publication or profile policy.
PROOF claims: actual concurrent PostgreSQL sessions and explicit barriers; reduced dependency schema, not hosted proof.
PROOF calendar: real deliveryDeadlines/family-time deadlines persisted by service RPC, binding boundaries and PostgreSQL races; no hosted runtime or scheduler activated.
LOCAL_CLUSTER_REMOVED /tmp/unica475-pg-tuVj48
SCOPED_SYNTAX_WHITESPACE_CLOCK_CLUSTER_SCOPE_OK
```

Subsystem proof limits:

- Receipt: real public hooks and RPCs proved database admission and retained facts. Synthetic Storage metadata passed through the quality/bytes seam.
- Marking: production S4/S5 versions and publication ran. No model or profile publication ran.
- Calendar: the real application helper supplied the durable deadline. Local PostgreSQL proved its use, boundaries, retries and lock order. No hosted or production runtime ran.
- Recovery: public service reads/writes and concurrent reconcile calls proved durable request recovery. No deployed server adapter or active scheduler ran.
- Authorization/deletion: local RLS, grants, family/child fences and cascades ran. The reduced fixture does not prove hosted role defaults or the complete deletion worker.

The first run passed 26 groups after the initial implementation. The second run passed 33 groups after the new races and boundary probes. The final run passed 34 groups after the bounded recovery read was added. No failing run was hidden. Full tests, build, lint, browser, Chromium, generation and paid/model calls were not run, as requested.

## Remaining root work

- Review the exact implementation head and this handoff independently. No review subagent ran here.
- Integrate current main, including marking source `cfab81916a5e81d075f355c3f6c54cca646b6000`, then run the final combined checks. This local fixture uses the RPC versions present at the exact required base.
- Implement the typed server adapter and bounded recovery loop above. Make `clock-required` visible to admin operations. Do not treat it as an ordinary waiting result or remove a book from recovery.
- Seed reconciliation for pre-migration confirmed deliveries in bounded batches. A delivery that predates installation does not have a request until reconciliation or a new accepted scan calls the helper.
- Adapt claim readers and generated types for nullable Day 7 `backstop_at`. Read current deadline and historical claim evidence separately. Do not rewrite a claim after a correction.
- Select and record the reviewed production source/runtime clock version. The fixed Edmonton expected values deliberately fail if the canonical runtime changes. Review such a failure; do not restore SQL arithmetic or weaken the assertion.
- Verify hosted PostgreSQL 17 compatibility, permissions, cascades, platform quirks and production adapter behavior before acceptance. Apply the migration and generate types only in the authorized root release work.
- Preserve the existing delivery RPC input validation contract. This task removes its native tzdata from backstop calculation. It does not change that RPC's local-time validation or prove cross-runtime delivery-input parity. The clock test uses PostgreSQL wall text only to admit its synthetic delivery through that unchanged RPC.
- Complete the remaining #475 activity, reminder, UI, S12 and release work from the previous receipt handoff. HOLD-to-ask-for-scans behavior remains root application work.

No hosted/service connection, credential read, migration application, type generation, browser action, customer edit, provider call, push, PR, merge or watch occurred. The customer workbook remains frozen. The test runner stopped its server and removed its private cluster. The final process/scope check found no owned PostgreSQL process and no remaining `/tmp/unica475-pg-*` directory. Temporary logs were removed after their result was saved here.

Root can replace `HANDOFF_READY` with its consumed marker after integration.
