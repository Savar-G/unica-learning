# Isolated Maya stream persistence probe

This CLI uses unchanged `mayaCalls`, `mayaCallStore` and the public sweep with a separate synthetic table. It imports no real model client. It uses fake review and memory spend, events, wording history, notes, alerts and rebuilds. The build takes only the unchanged `hedged` and `withTimeLimit` functions from `ai-client.ts`. The provider and client factory are excluded from the worker.

Default invocation sends no request and reads no key:

```sh
node scripts/maya-stream-probe/run.mjs
```

## Late sweep settlement

At source `6eb24aec76a789bc21f03be49be1f897356a2680`, an abandoned incomplete reply settles as `time_limit` when the public sweep runs after the call limit. The required result is an unknown-priority `technical_issue`. The clock branch in `src/lib/maya/session.ts` runs before its technical event branch. Both pending-only and confirmed-prefix sweep cases fail the runner's strict outcome assertion. Retry and direct end use the same source and pass below the limit.

The repair lets a recorded technical failure keep its cause after the clock limit. Safety, content and solved outcomes retain their priority, and recorded duration stays capped. Normal elapsed calls still end as `time_limit`. The public session checks fail on the earlier source at and after the time limit. The local transport suite now requires all eight process cases to pass, including both sweep cases. It does not accept `time_limit` for an incomplete stream with unknown final priority. Hosted proof and independent review remain required before activation.

## Scope and boundaries

- Eight fixed IDs end in `1101` through `1108`. The table check and primary key bound the table to eight rows. Parent, child, book, kind, mode and fake model identities are fixed synthetic values. There is no production family reference or copied production row.
- The additive migration copies column types, defaults and NOT NULL from `maya_calls`. It copies no FK, trigger, index, policy or CHECK. It adds its own synthetic identity CHECK and primary key. It enables RLS and revokes PUBLIC, anon and authenticated privileges. Only service_role gets SELECT, INSERT, UPDATE and DELETE.
- The adapter exposes only `from("maya_calls")` to the unchanged store. Before transport, it maps that entry to `maya_stream_probe_calls` and constrains exact IDs. It refuses every other table, RPC and client operation. Mutation without exact IDs is refused. Redirects are refused. Every request has a five-second limit.
- Each checkpoint case starts an owned OS process. After the pending write or the first confirmed prefix and next pending write return, the controller kills that process with SIGKILL and waits for its exit. It runs the reader in a new process on the same built source and table. No final save or shutdown save runs in the killed process.
- A replacement uses the unchanged store's compare-and-update revision fence. The public retry, end and sweep paths settle the saved call. Only confirmed words, batch IDs, drawings and help may survive. Recovery must retain unknown-priority technical settlement, ask no model or reviewer and take one child turn. Repeated end must keep one event and note. A third process repeats end and must create no effects. Old-revision checkpoint and final writes must return zero rows.
- Normal completion with sentence writes and the old whole-JSON path are controls. Sweep discovery reads only the exact probe ID and keeps its cursor in memory. It never reads production sweep cursors.
- Transport output separates `pending_write`, `owner_reread` and `confirmation_write`, with HTTP status, response row count and elapsed milliseconds. Dispatch output measures the interval after the ownership HTTP response. This interval includes client parsing and is not an atomic database-to-dispatch guarantee. Stale-write checks must have status 200 and zero rows. Row counts for insert and delete use returned representations. No key or transcript is logged.
- The run has an overall 180-second process limit after its local build. Each worker has a 25-second limit. The controller waits at most 30 seconds for that worker. Only owned child processes are stopped. No existing server is used or stopped.

This is a mapped-table persistence probe. It does not prove the production admission claim RPC, production FKs/triggers, hosted Next requests, network receipt, browser rendering, paid models, family gates, durable external side effects or full production sweep discovery. Memory event/note counts prove local calls and stored completion markers; they do not prove hosted event/note idempotency after a crash between those separate writes.

## Lead procedure

1. Review the SQL, runner and late-sweep repair. Run the eight-case local transport proof with all cases required to pass. Complete independent review and CI.
2. Verify the hosted project `cdjobwsyzndtltzfpyqa` and current migration history. Check the new prefix against live history and current `origin/main`. The child checked the local and existing origin tree. The latest live version supplied by the lead was `20261116190648 scan_send_receipt`.
3. Apply only `supabase/migrations/20261116192537_maya_stream_probe_calls.sql` through the lead's Supabase MCP. Verify the returned version, table columns, RLS, service privileges and lack of FKs, triggers and policies. Probe invalid identities, including NULL workbook IDs and a non-fake model, in a rolled-back transaction. Verify that browser roles cannot select or mutate the table. Do not add a grant to fix browser denial.
4. Run `npm run db:types` and `npm run db:checks`. Commit both generated files in this PR. The child leaves both untouched. Do not hand-edit either file or bypass query types.
5. Use a clean checkout at the reviewed full source SHA. Supply `SUPABASE_SECRET_KEY_FILE` or `SUPABASE_SECRET_KEY` through the existing secure environment seam. Do not paste a key into a command or a report. The command below uses the already supplied key seam and pins the current clean HEAD. Record that SHA separately before the command.

```sh
git rev-parse HEAD
```

```sh
SUPABASE_URL=https://cdjobwsyzndtltzfpyqa.supabase.co node scripts/maya-stream-probe/run.mjs --run-hosted --source="$(git rev-parse HEAD)"
```

The runner refuses a wrong project, dirty checkout, missing source pin or occupied IDs. It does not delete old evidence before a run. Record all per-phase transport output, the final source hash and the result. An assertion failure keeps activation blocked. A request being accepted is not a passing proof.

6. Inspect the eight fixed probe rows and the result. To remove only those synthetic IDs after evidence capture, use the same clean source and key seam:

```sh
SUPABASE_URL=https://cdjobwsyzndtltzfpyqa.supabase.co node scripts/maya-stream-probe/run.mjs --run-hosted --cleanup --source="$(git rev-parse HEAD)"
```

Cleanup can delete only the eight listed IDs from the probe table. It cannot delete a family or a production call. Keep a failed run's rows until the lead has inspected them. Another run cannot adopt or overwrite occupied IDs.

7. Verify the final readers on web, end and sweep workers. Verify the incompatible-server window has ended. After review, CI and hosted proof pass, the lead alone merges and sets exact `MAYA_CHAT_STREAMING_ENABLED=on`. The trusted gate still blocks time before `2026-11-17T06:31:27Z`. Keep the family switches and credit hold unchanged. Remove the stream flag or set `off` to stop new parts. Retain compatible readers and all pending records.

## Local checks

Falsifier: an unconfirmed part becomes accepted, confirmed help or drawings disappear, recovery asks a model/reviewer, a child/event/note duplicates, an old revision writes, or a forbidden request reaches transport.

```sh
bash /Users/savargupta/unica-workbook-samples/customer-first-book-20261106/maya-coverage/gate-slot.sh npx vitest run --config scripts/maya-stream-probe/vitest.config.mts scripts/maya-stream-probe/probe.test.ts --maxWorkers=2 --sequence.shuffle --sequence.seed=1128
```

The red control changes pending records to legacy accepted parts in the fake database. The unchanged runner must reject this corruption. The tests also refuse foreign tables/RPCs/IDs before transport, refuse occupied fixture IDs and verify exact-ID cleanup. They make no hosted request.

Falsifier: TypeScript finds a mismatch in the actual core, store, runner or test calls.

```sh
bash /Users/savargupta/unica-workbook-samples/customer-first-book-20261106/maya-coverage/gate-slot.sh npx tsc --noEmit --incremental false -p scripts/maya-stream-probe/tsconfig.json
```
