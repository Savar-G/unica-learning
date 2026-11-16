# OpenRouter provider usage webhook

OPENROUTER_COST_WEBHOOK_V1: DONE

Release setup is in progress. The implementation passed two independent reviews and a final
settlement at `738390873818247413b73fa3e498cdb65b4455e2`. ROOT applied the hosted migration,
generated the schema files, and mounted the report after #1129. Destination setup, deployment,
and genuine provider delivery verification remain pending. No paid model call has run.

## Scope

Base: `6eb24aec76a789bc21f03be49be1f897356a2680`.
Machine: Savar's MacBook Pro (4).
Worktree: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-a0e79d5c-89f87a7d4b581c0a`.
Branch: `site/openrouter-usage-webhook`.

This is independent, append-only provider evidence. It does not import or change the app
ledger or the existing `/admin/ai` page. It does not depend on #1129's schema.
The provider subtotal and app subtotal overlap. Never add them together.
The headline uses the Unica workspace analytics total. The active page makes no account-credits query.
No legacy ledger cost is assigned to a provider generation by a time cutoff.

## Endpoint and configuration

- POST `https://unicalearning.com/api/openrouter-usage`.
- Node runtime. Route maximum duration: 10 seconds.
- `OPENROUTER_USAGE_WEBHOOK_SECRET`: a dedicated random secret, 32 to 512 characters.
  Do not use an OpenRouter API key or a Supabase key.
- `OPENROUTER_USAGE_WORKSPACE_ID`: the actual provider workspace ID for the destination.
  Use the fixed Unica UUID 2468d17e-b7eb-467f-b1ef-feec9e328d58, not the URL slug. The route and database refuse another workspace.
- `SUPABASE_SECRET_KEY`: the existing server ingestion credential.
- Header: `Authorization: Bearer <OPENROUTER_USAGE_WEBHOOK_SECRET>`.
- Content type: `application/json`. Encoded/compressed bodies are rejected.
- Maximum body: 1 MiB, counted while reading. Maximum batch: 256 spans.
- A single eight-second deadline covers body reading and the database request.
- Authentication precedes body parsing and database access. The comparison uses SHA-256
  digests and `timingSafeEqual`.
- Success: empty 204. Invalid input: empty 400. Unauthorized: empty 401.
  Unsupported content: empty 415. Missing configuration or database failure: empty 503.
  No response includes credentials, payload data, or a database error.

`X-Test-Connection: true` accepts `{}` or `{"resourceSpans":[]}` after authentication.
It creates no cost row. A nonempty test is rejected. There is no unauthenticated test bypass.
Local test payloads never went to the hosted endpoint.

## Provider field evidence

Official documentation was read on 2026-11-16:

- [Broadcast](https://openrouter.ai/docs/guides/features/broadcast).
- [Webhook](https://openrouter.ai/docs/guides/features/broadcast/webhook).
- [OpenTelemetry collector](https://openrouter.ai/docs/guides/features/broadcast/otel-collector).
  The requested `/opentelemetry-collector` URL returns 404. The Broadcast guide links `/otel-collector`.
- [Elastic OTLP mapping](https://openrouter.ai/docs/guides/features/broadcast/elastic).
  This official guide supplies the generation-ID mapping absent from the webhook example.

| Stored field | Source |
| --- | --- |
| workspace_id | Configured destination workspace; a supplied `span.metadata.openrouter_generation.workspace_id` must agree |
| generation_id | `gen_ai.response.id`, documented as the OpenRouter generation ID; never `traceId` or `spanId` |
| occurred_at | `startTimeUnixNano`, converted to UTC milliseconds |
| model | `gen_ai.response.model`, else `gen_ai.request.model` |
| api_key_id | `span.metadata.openrouter_generation.api_key_id` or `.api_key.id`; both must agree if present |
| cost_usd | `gen_ai.usage.total_cost` or `span.metadata.openrouter_generation.usage`; both must agree if present |
| input_cost_usd / output_cost_usd | `gen_ai.usage.input_cost` / `.output_cost` |
| input_tokens / output_tokens | `gen_ai.usage.input_tokens` / `.output_tokens`; older `.prompt_tokens` / `.completion_tokens` must agree if present |

The collector guide states that `gen_ai.usage.total_cost` is the full OpenRouter charge.
For BYOK this can be a fee or actual zero. Input/output costs are upstream inference
portions. They must not be added to the total, or used instead of it.
Missing cost remains null. Invalid or conflicting values reject the full batch.
Actual zero remains zero. A nonzero decimal that underflows to zero is rejected.
The database uses unconstrained `numeric`, so it does not round a small charge to zero.

The Broadcast guide says usage reporting uses the root GENERATION observation;
provider-attempt and timing SPAN observations do not carry generation totals.
The parser selects canonical generation response IDs and accounting fields. It skips
wrappers, attempts, and timing spans without generation accounting fields. It does not
use span names or arbitrary metadata to classify a generation. A generation can have
an external/grouping `parentSpanId`, so an OTLP parent does not make it an attempt.
A span with a cost but no canonical generation ID is rejected, not counted as zero.
A response ID without any cost or accounted-token field is ambiguous and is also rejected.

The docs do not provide a complete authenticated Webhook export with all optional
identity and accounting fields. Tests use synthetic fixtures assembled from the official
mappings. ROOT must verify the actual allowlisted field names on a genuine provider
delivery before claiming live capture. Do not store or log a raw payload for that check.
Do not add a fallback to trace IDs or caller metadata if a field differs.

## Privacy boundary

The parser produces exactly ten allowlisted fields listed above. The database adds
`received_at`. No prompts, completions, stop strings, usernames, end-user IDs, API key
labels, raw usage objects, caller metadata, trace IDs, or complete payloads are persisted
or logged. Only safe API key IDs are retained. Unknown key IDs stay unknown.

Caller `trace` metadata arrives under `trace.metadata.*`. The parser ignores this
namespace, including apparent cost, workspace, key, generation, child, and feature fields.
Canonical `gen_ai.*` fields and provider generation observation metadata supply billing.
Duplicate allowlisted attributes and conflicting aliases reject the batch.
Privacy Mode alone is insufficient: provider docs say it retains stop sequences and
custom metadata. The receiver still drops those fields.

## Database and attribution

Migration: `supabase/migrations/20261116192429_openrouter_provider_receipts.sql`.
Applied through Supabase MCP on 2026-11-16 as version `20261116204257`, name
`openrouter_provider_receipts`. The local timestamp was unique in local files, `origin/main`
and hosted history before application. Hosted schema dependencies and generation uniqueness
were verified first.

- Primary key: `(workspace_id, generation_id)`.
- One service-only RPC transaction ingests a complete batch in identity order.
- Identical retries are no-ops. A conflicting duplicate aborts the full batch.
- No partial successful batch is acknowledged. A lost response can be retried safely.
- Updates and deletes are refused. Service ingestion has no direct INSERT grant.
- RLS allows admin reads only. Parents and anonymous callers cannot read or ingest.
- Functions use an empty `search_path`. EXECUTE grants are explicit.
- Admin reads use the verified admin's session, not the service key.
- `admin_openrouter_provider_receipts` joins `ai_usage_events` only on
  `provider = 'openrouter'` and exact `generation_id`.
- The join runs at read time. A delayed app ledger row can supply later attribution.
- A generation ID observed in multiple workspaces remains unmatched because the app
  ledger does not hold a workspace ID. No workspace is guessed.
- The table stores no family or child ID. A deleted app event leaves the receipt unmatched.
- Test and team costs stay included. An existing app test-family filter is not applied.
- Unmatched generations have unknown feature and child. A matched event without a child
  stays without a child. Key names and prompts never supply attribution.
- Totals cover all period rows. Each detail grouping is capped at 1,000 groups.
  `omitted_groups` reports truncation. There is no silent row limit on totals.
- Coverage is exact app matches divided by received generations. It is not delivery
  coverage or an account balance. Unknown costs are counted beside known-charge subtotals.

## Integration export for ROOT

- `readProviderReceipts(admin, { from, to })` from
  `src/lib/openrouter-provider-receipts-store.ts`.
- `periodFor(parseRange(query.range), Date.now())` and
  `RANGES` from `src/lib/admin-ai-usage.ts`.
- `<AdminProviderReceipts view={viewOrNull} periodLabel={period.label} ranges={pills} />`
  from `src/components/admin-provider-receipts.tsx`.
- The component accepts the existing `Pill[]` type. Use the shared `range` links and preserve
  the page's other query parameters. Supply `current` for the selected range.
- Obtain `admin` through the existing `requireAdmin` boundary. Catch a read failure and
  pass null to show unknown, never an empty/zero view. The server read also rejects malformed data.
- Period choices: 7 days, 30 days, this month, or this year. One selection controls the workspace, app and receipt reports. They use the shared family-time functions
  and the dated Vancouver overrides. SQL uses `[from,to)` and caps a read at 366 days.
- The server RPC transport uses PostgREST directly to keep this patch buildable before
  the hosted migration and type generation. It does not invent or alter generated types.

The page mounts the provider report beside the separate app subtotal. It does not read account credits. Do not connect provider totals to the app page's test-family exclusion.

## Local checks

All model calls, webhook inputs, sessions, and transport results are fake or local.
The SQL runner creates and removes its own disposable PostgreSQL cluster. It uses
`/opt/homebrew/bin`, verified on this Mac. Set `OPENROUTER_PROBE_PG_BIN` for another local installation.
It does not connect to an existing or hosted database.

```sh
npx vitest run src/lib/openrouter-usage-webhook.test.ts src/lib/openrouter-provider-receipts.test.ts src/lib/openrouter-provider-receipts-store.test.ts src/components/admin-provider-receipts.test.ts --maxWorkers=2 --sequence.shuffle --sequence.seed=1613
node supabase/tests/openrouter_provider_receipts.cjs
npx eslint src
npm test -- --maxWorkers=2
npm run build
```

Verified on this Mac on 2026-11-16: the four focused files passed all 39 tests in random
order (seed 1613). The local SQL probe, repository ESLint check, production build, and
final `npx tsc --noEmit` check passed. The full suite passed 30,137 tests in 948 files.
It reported 36 skipped tests, three skipped files, and one todo. The final production build passed
after the last parser change.

- Receiver tests prove authorization order, connection-test handling, privacy allowlisting,
  correct total charges including fees, zero versus unknown, aliases, invalid/mixed batches,
  byte/span limits, a stalled body deadline, and a retry after a failed acknowledgement.
- Store tests prove service-only ingestion transport, admin-session read transport,
  deadline propagation, and generic failures. They pass through fake HTTP, not PostgREST.
- Admin tests prove visible unknown states, separate subtotals, coverage, period links,
  model/key/feature groups, child test costs, and truncation disclosure. They render local
  HTML only. They do not prove a browser layout or integration into the existing page.
- SQL probes prove unique identity, identical/reordered/concurrent retries, atomic conflict
  rollback, privacy rejection, RLS/grants, append-only behavior, period bounds, delayed
  attribution, test costs, and workspace ambiguity on local PostgreSQL. They do not prove
  the hosted schema or hosted permissions.
- Duplicate mutation: remove `on conflict (workspace_id, generation_id) do nothing` from
  a temporary migration copy. `OPENROUTER_PROBE_MIGRATION=/tmp/openrouter-duplicate-mutant.sql
  node supabase/tests/openrouter_provider_receipts.cjs` fails on the identical retry.
- Privacy mutation: add a private field to a temporary parser copy. The exact allowlist
  and private-data tests both fail. Candidate files were not mutated for either control.

## ROOT activation steps

1. Conduct the independent fixed-head review. No delegate was started by this implementation worker.
2. Check live migration history and schema dependencies. Apply the additive migration.
3. Verify hosted RLS, privileges, the unique key, and transaction behavior. Use a rollback-only
   synthetic probe. Do not leave synthetic spending in provider receipts.
4. Run `npm run db:types` after apply. Run `npm run db:checks` for the new constraints.
   Commit generated outputs. No generated file was edited by this worker.
5. Integrate the component after #1129. Check the mounted page in Aside.
6. Configure the dedicated secret and actual workspace ID on the deployed server.
   Use the authorized credential channel. Keep secrets out of URLs, logs, and this document.
7. Merge and deploy only after review and checks. No production flag was set by this worker.
8. In Aside, open
   `https://openrouter.ai/workspaces/unica-learning/observability/destinations/new/webhook`.
   Configure URL `/api/openrouter-usage` on `https://unicalearning.com`, method POST, and
   the Authorization header. Set Privacy Mode on. Set Cost and Identity on.
   Leave Request context and Cost allocation off. Keep all-key selection, no excluded keys,
   and sampling rate 1.0, including testing keys. Enable Broadcast for this destination.
9. Run Test Connection. It must return authenticated 204 and add no receipt row.
10. Verify a genuine delivery using only allowlisted fields. Confirm the actual generation ID,
    total charge, key ID, workspace, and root/attempt shape. Confirm an exact app match when
    the app records that generation. Confirm an unattributed tool generation stays unknown.
    ROOT owns any paid-call authorization and cost for this step. This worker made no paid call.
11. Check period subtotals against the same Unica workspace and dates in provider activity. Do not query account-wide or Unify costs.
    Do not claim complete historical coverage: Broadcast is forward delivery, with possible
    sampling, outages, failed batches, or provider retry limits. This patch has no backfill.
12. Record verified activation state and remaining limits in the Unica project vault notes.

## Remaining limits

Hosted rollback probes passed identical retries, conflicting-batch rollback, update refusal,
admin totals, non-admin function refusal, populated-table RLS, explicit service privileges,
and empty function search paths. No synthetic receipt remains. Schema types and checks were
generated from the hosted schema. Aside verified the mounted local page using the admin's
session and the hosted read: the provider report was empty and the app/account totals remained
separate. These checks do not prove provider delivery or the deployed receiver.

Production has the dedicated webhook secret and verified Unica workspace ID configured.
The verified historical keys and all six dedicated product keys belong to that workspace. The separate
Unify workspace is outside this destination's scope. Key values are never shown.

Destination configuration, deployment, genuine delivery, provider-format verification and
the production page check remain pending. Conflicting provider revisions require review;
append-only ingestion returns 503 instead of replacing earlier evidence. No estimate fills a gap.
