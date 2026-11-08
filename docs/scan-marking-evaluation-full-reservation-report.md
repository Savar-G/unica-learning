# Evaluation full-reservation resolution

IMPLEMENT_DONE_EVALUATION_FULL_RESERVATION

The service RPC records an unknown evaluation attempt as `unknown, charged at its full reservation`. The full amount stays spent in the existing ledger. It is a conservative accounting amount. The actual provider charge and usage remain unknown.

Computer: `Savars-MacBook-Pro-5.local`.
Branch: `t3/evaluation-full-reservation-resolution`.
Prepared checkout: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-052161eb`.
Resolved path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-052161eb`.
Required base: `677a9ddc20b987a10b6fabf4288e0041331b0577`.

The tracked files were clean at start. Only this prepared branch was advanced from `96e845e558aa867a27d355679b6e24871360a944` to the required base, with a fast-forward. No checkout or shared branch was created or changed. This work used the current Sol high session. It started no agent.

## Changed paths

- `supabase/migrations/20261107034950_scan_marking_evaluation_full_reservation.sql`
- `supabase/tests/scan_marking_evaluation_full_reservation.cjs`
- `docs/scan-marking-evaluation-full-reservation-report.md`
- `docs/scan-marking-evaluation-full-reservation-local-proof.log`

## Durable operation

`resolve_scan_marking_evaluation_full_reservation(p_run text, p_attempt text, p_id uuid, p_evidence jsonb, p_actor text)` returns a boolean. Only `service_role` has execution permission among application roles. `p_attempt` is the saved 64-character attempt key. `p_id` is the reservation UUID. No caller amount or maximum is accepted.

The RPC takes the existing global budget lock first. It locks the evaluation admission, spend, admitted price and run cap. The reservation must be positive and at most 15,000,000 microdollars. It must equal the maximum of the durable price at the admitted model, endpoint and evidence hash. The saved pixels must fit that price. The durable run cap must contain the reservation. A disabled historical price can still prove its original bound. A missing or changed bound refuses resolution.

The evidence input is the original saved unknown journal object. It must have the matching run, key, model and reservation UUID. Its saved reservation must equal the durable reservation. The HTTP status must be 200. The body, envelope and OpenRouter metadata must be explicit nulls in all saved transport copies. The saved latency must be at least 60,000 ms. Every provider, model, generation, cost and token field in the attempt usage must remain explicitly null. This is a narrow operation for the saved HTTP 200 body-timeout case. Elapsed time alone does not establish a measured provider charge.

If the journal contains a result, the result must match its run, model, admitted evidence hash, photo and batch. The result must contain exactly one copy of the target attempt, with identical values. The database has no durable photo, batch or request hash for an evaluation admission. Root must verify those against the original local artifacts. JSONB preserves the saved values. It does not preserve JSON whitespace or key order. The original journal files remain unchanged.

The RPC calls the existing `settle_scan_marking_evaluation` with the durable full reservation. It appends the audit row in the same transaction. The audit uses the settlement's database-clock time. It records the actor, outcome, amount, reservation, price maximum, run maximum, model, endpoint, evidence hash, pixels, period and original evidence JSON. An audit-insert failure rolls back the settlement.

Any settled attempt or repeated resolution returns false. Production-only spend has no evaluation admission and returns false. An existing clean429 classification also returns false. Unknown usage stays unknown in the evidence. No generation ID, token count, actual provider charge or zero settlement is created.

The audit has RLS and an explicit service-read policy. No application role can insert, update, delete or truncate it directly. A trigger also refuses privileged update, delete and truncate operations. Restrictive foreign keys preserve the audit through ordinary attempt, run, price and spend cleanup. These controls require no family or photo records.

## Prior control and local proof

Before the candidate migration, a reserved unknown attempt remains fully held. The checked admission RPC refuses the next attempt with `unresolved-evaluation-cost`. The resolution RPC does not exist. The probe then applies and rolls back the candidate DDL. It verifies that the new table and RPC disappear after rollback.

After candidate application, the probe compares every prior public function definition with its earlier definition. They are identical. The existing checked admission, clean429 deferral, price refresh and settlement functions are unchanged. The SQL change defines no production marking operation.

Final results on local PostgreSQL 18.6:

```text
SCAN_MARKING_FULL_RESERVATION_SQL_OK 64 cases
SCAN_MARKING_EVALUATION_SQL_OK 8 cases
SCAN_MARKING_PRICE_REFRESH_SQL_OK 21 cases
SCAN_MARKING_CLEAN429_SQL_OK 23 cases
```

The 64 new cases cover exact full settlement, unchanged raw evidence, actor and database time, repeated resolution, lower later settlement, all three caps, two retained clean429 holds, another unresolved unknown, evidence and bound failures, missing and production-only spend, service/browser permissions, cleanup refusal, migration rollback, operation rollback and failed audit insertion. Three tests use two database connections: simultaneous resolution, full resolution before normal settlement, and normal settlement before resolution. The last two prove a lock wait with `pg_blocking_pids` before releasing the first transaction.

One synthetic fixture starts with two classified holds, an unknown reservation of 147,948 microdollars and prior recorded spend. Its aggregate is 1,308,144 microdollars before and after full resolution. Both old holds remain unsettled. This proves the arithmetic with synthetic records. It does not verify the actual stopped run or its other holds.

The initial zero-bound fixture hit the existing ledger check constraint. The final probe verifies that refusal first. It then removes that constraint only inside a local rollback transaction to exercise the RPC's additional damaged-state guard. An initial inherited-price probe used an empty database. The final runner follows that probe's documented prerequisite and runs the original evaluation bootstrap first.

- SQL accounting: proved full permanent spend through the real public evaluation RPCs and two-session controls. It did not contact a provider.
- SQL access: proved browser denial and service access on a local service role without BYPASSRLS. It did not prove hosted effective grants or PostgREST behavior.
- SQL rollback: proved DDL rollback, atomic evidence/settlement rollback and cleanup protection. It did not apply a hosted migration.
- Runtime and reports: no source module or old artifact changed. These SQL checks did not run the comparison CLI or modify its unknown-cost stop. The audit outcome is the plain accounting label. Existing reports still retain their original unknown usage and held-amount labels.

The repository has no separate platform-quirks document. The relevant recorded limits were checked in `AGENTS.md`, the scan-marking reports, the clean429 report and the Supabase skill: explicit grants, default function EXECUTE revocation, empty function search paths, RLS versus service BYPASSRLS, restrictive cleanup and hosted proof limits. The current public Supabase changelog and database-functions documentation were also read. The installed CLI is 2.118.0; the CLI 3.0 default-target change does not apply to this local SQL runner.

## Reproduction

The runner creates its own socket-only PostgreSQL cluster. It disables TCP listening. It stops its cluster in a `finally` block. It accepts no database URL or key. The inherited SQL probes run in separate disposable databases. The price-refresh probe reuses the original evaluation bootstrap database, as its instructions require.

This checkout had no installed dependencies. The only installed test dependency was the repository's pinned `pg@8.16.3`, in a temporary directory:

```sh
npm install --prefix /tmp/pd542-resolution-node --ignore-scripts --package-lock=false --no-audit --no-fund pg@8.16.3
NODE_PATH=/tmp/pd542-resolution-node/node_modules node supabase/tests/scan_marking_evaluation_full_reservation.cjs
```

The default binary directory is `/opt/homebrew/opt/postgresql@18/bin`. `SCAN_MARKING_PG_BIN` can select another installed PostgreSQL directory. The final proof log records the owned cluster path and its stop. A separate `pg_ctl status` check returned `no server running` for that cluster. `node --check` and `git diff --check` passed.

## Root work and limits

Root must obtain an independent Sol review for this money and migration change. Root must apply the additive migration, verify hosted effective privileges, run rollback and service HTTP probes, and generate official database types. This implementation does not edit generated types. Public function security guidance: [Supabase database functions](https://supabase.com/docs/guides/database/functions).

Root must supply and verify the actual saved journal and explicit actor before any real resolution. The supplied reservation UUID is `62aeafd4-706c-43ec-b4b4-cd6f3bbc3814`. The supplied run is `8f98a4fcb8619e8ad3ab4b00c15d68db8d2c42eef220d5bce585b15526046094`. Those are task inputs, not locally verified database facts. No actual stopped-run file was read or changed. That old run must remain stopped. This SQL operation grants no local resume permission. The two other clean429 holds must remain held.

No full suite, build, browser, Chromium, paid call, key read, hosted write, hosted migration application, real resolution, push, PR or merge ran. No shared AI helper, Maya, print, family flag, model pin, photo, marking output schema or prompt changed. The separate v7 commit `d6ae8521` was not merged or edited. Root owns the later limited two-model run.
