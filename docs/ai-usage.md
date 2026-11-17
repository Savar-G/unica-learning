# AI usage and cost (D-330)

`/admin/ai` shows OpenRouter charges for the Unica Learning workspace only. Workspace usage, incomplete recorded app data and received provider receipts are separate, overlapping subtotals. Never add them. The page does not read account credits or configured-key monthly usage. Neither page claims that every paid call has a stored record.

Both `/admin/ai` and `/admin/ai/children` include test and admin families by default. The global Show test families switch does not reduce their totals. Detailed records identify production, practice, evaluation, test, test-family, or unknown work where evidence permits. Unknown work stays unknown.

## The ledger

`public.ai_usage_events` holds one row for each AI call that came back with usage: time, feature, provider (`openrouter`, `anthropic` or `subscription`), model, input and output tokens, cost in US dollars (null when the provider gave none), OpenRouter's generation id, `parent_id` and `child_id` when the caller knows them, and `source_kind` with `source_id` (a workbook run, a Maya call, a scan photo, an assessment).

- Append only. A trigger refuses an update.
- Written by the server only, with the secret key. Admins read. Parents read nothing.
- Deleted with the family and with the child (foreign keys with `on delete cascade`). The family write fence and the child delete fence cover new rows.
- A call with no family has a null `parent_id`: team tools, sample runs, and any call whose caller did not know the family.
- Features: `workbook`, `solve_check`, `workbook_gate`, `maya`, `maya_review`, `maya_note`, `maya_speech` (an estimate, older ledger only), `child_profile`, `learner_profile`, `report`, `work_review`, `marking`, `explain`, `photo_check`, `other`. The list in `src/lib/ai-usage.ts` equals the check on the column (`src/lib/state-lists.test.ts`).

## Writing

`recordAiUsage(tag, reading)` in `src/lib/ai-usage.ts`. It never throws or waits for the database: it starts the insert (5 s limit) and returns. Local processes first retain a synchronous file receipt. A failed write logs one status with no response data. Only a unique receipt or generation conflict is a duplicate; foreign-key conflicts remain failures. No child name, prompt or answer goes in: ids only.

Provider adapters record answers directly. Wrappers pass feature and family tags into the adapter, rather than writing a second row. Missing provider prices remain null. Subscription calls have no per-call charge. Speech and voice remain estimates from `maya_spend` and are not treated as OpenRouter receipts.

| Producer | Coverage and context | Completion |
|---|---|---|
| Shared OpenRouter client (`ai-client.ts`) | Feature, model, known family/child, provider cost and generation id, safe key label and SHA-256 identity | Next instrumentation registers each pending write with `after`; provider failure before usage remains unpriced/unrecorded |
| Direct OpenRouter client (`ai-openrouter.ts`) | Same adapter-level recording for direct local calls, including refused/cut-off answers that report usage | Local receipt is written before the call returns |
| Marking / explanations / decisions | Dedicated labels: marking, explanations, decisions. Decisions retain their existing per-request charge aggregation | Same ledger; no reservation/admission changes |
| `maya:practice` | Practice context and a run UUID. Tutor calls are Maya; simulator and judges are other. Model and key identity remain known | Flush before exit; local receipt file persists even without database credentials |
| `maya:text` | Test context and a run UUID | Flush before exit |
| Workbook samples / marking comparisons / decision comparisons | Evaluation context and a run UUID. Writer and solve calls keep their feature | Flush at completion; local receipts persist |
| Workbook worker | Production context, workbook run and known family/child; test-family status comes from stored family flags | Existing configured sink and per-job flush remain |
| Voice worker | Production context; stored admin-test calls and test families are classified separately by the read | Flush after worker shutdown. Speech/voice remain estimates, not actual provider bills |
| Direct Anthropic client | Answer/model/token receipt and key identity; cost remains unknown because the response does not give a charge | Same local receipt and flush path; no invented USD price |
| Claude and Codex CLI adapters | Subscription usage, no per-call charge; workbook tags where known | Same local receipts and caller flush |

The recorder stores only bounded metadata, ids, and usage. It stores no prompt, answer, name, audio, or raw key. Allowed key labels are an enumerated list. A SHA-256 key identity distinguishes rotations and identifies shared credentials without exposing them. Local wrappers set the run context and a UUID. Unidentified legacy keys remain unknown. The database also classifies `maya_calls.kind = admin_test` from the retained call id. Test-family flags do not prove that every historical call was testing at the time; the read uses current family flags.

On a local process, `.ai-usage/receipts.jsonl` retains each receipt before asynchronous recording starts. The directory is gitignored. `AI_USAGE_RECEIPT_FILE` can select another local file. It contains ids, so handle it as private operational data and remove copies after a verified import when no longer needed. A missing `SUPABASE_SECRET_KEY` does not enable a hosted write. Local receipts do not appear in the hosted panel until an authorized operator imports them. A failed local file write emits a generic error. A process killed before a provider supplies usage can still leave no receipt.

Next.js instrumentation registers a process-global host callback for `after`, independently of Sentry being enabled. The callback is shared across the separate instrumentation and request bundles; it contains no credentials or request state. Workers/scripts flush their writes. This reduces exit loss; it does not prove complete provider coverage. The database can reject or time out, providers can omit prices, and not all external tools use these adapters.

Maya's spending cap is not changed: `maya_spend` still decides the stop. Marking's and the explanations' spend rows are not changed either. The new ledger only reads the answer's usage.

## Reading

`admin_ai_usage(p_from, p_to, p_with_tests, p_cad_per_usd, p_day_starts)` (admins only; `p_day_starts`: the start instant of each day, so the daily cost follows the site's own Vancouver day rules, not the database's) returns totals, a daily cost by model (Vancouver days), cost by feature, cost by model and up to 200 family lines, each with the family's monthly plan price from `child_plan_states` (paying, and ending until its end date; a free month counts as no revenue). Test families and admin families are left out unless `p_with_tests`; calls with no family stay in.

It also adds the cost older ledgers hold, so the page has history. For one call the new ledger wins:

| Older ledger | Rule |
|---|---|
| `workbook_run_ai_calls` (writer calls and solve checks; `workbook_run_solves` repeats the same checks and is not read) | a run with any new row of the same feature skips its older rows |
| `maya_spend` (CAD micros, turned to USD by `MAYA_USD_TO_CAD`; no model name) | a Maya call with any new row skips its older rows; speech and voice always count |
| `scan_marking_spend`, `parent_explanation_spend` | no family on these rows. They count only before the first new row of that feature, and show as team totals |

Rows with no model name show as "not recorded".

## The page: `/admin/ai`

Admins only (others get the site's 404). In the sidebar under Quality as "AI usage". A glance, not a deep tool.

- Period pills: 7 days, 30 days (default), this month, this year. Days are Vancouver days (`PACIFIC_ZONE`, `src/lib/family-time.ts`). The page sends the start of each day to the app reader (`p_day_starts`). The year starts on January 1 and contains at most 366 days, within the app reader's 400-day limit. The provider query schema has no shorter documented time-range limit.
- Workspace reader: POST `/api/v1/analytics/query` three times, concurrently, on the server. Every request has the fixed filter `{field: "workspace", operator: "eq", value: "2468d17e-b7eb-467f-b1ef-feec9e328d58"}`. Neither environment variables nor page parameters can change the workspace. All three requests use the same selected `periodFor` bounds and `cache: no-store`.
- Workspace credential: only `OPENROUTER_MANAGEMENT_API_KEY`. There is no fallback to a model-call or billing credential. No credential produces unknown costs without a provider request. One five-second deadline covers all three requests and response bodies. Failures cancel sibling requests.
- Provider groups: aggregate by `workspace`, then independent groups by `model` and `api_key_id`, requesting `total_usage` and `request_count`. The aggregate must return exactly one `Unica Learning` row. All groups must have finite nonnegative costs and safe nonnegative integer counts. Metadata must report the correct row count, no truncation and no warnings. Both detail sums must match the aggregate request count exactly and the charge within per-row rounding tolerance. A failed, malformed or incomplete snapshot produces unknown totals, never a partial or invented zero.
- Report links: Features (default), Models, API keys, Families and Records. The report stays selected when the period changes. Period links keep the report. Only the selected report is rendered, on the existing admin frame and shared type, spacing and colour tokens.
- The header shows workspace charges, workspace requests and partial app cost. Headline amounts use the existing USD formatter. Exact workspace amounts remain in title text. Detailed notes start closed.
- Model and key breakdowns show all returned groups, with models after the first eight in a disclosure. API key labels are native provider names. They do not prove a product feature, family or child. Historical shared keys can serve several features. Current requests use the caller product key. No classifier, model inference or key-name rule assigns these charges.
- Workspace activity links use the Unica slug and carry the fixed workspace and exact selected UTC bounds. Legacy account helpers remain exported for compatibility, but this page does not call them.
- Recorded app tiles: known costs plus estimates/history, with the limits in About these costs. Features use cards that open retained family/child detail. Recorded calls, subscription calls, work context and cost basis are on Records. This is a subtotal of retained records, not total provider spend. The selected 7-day/30-day/month/year period uses Vancouver days. Test/admin families are always included on these pages.
- Breakdown: work context, cost basis (provider, estimate, unknown), safe key label/identity, feature, model, and a family/child disclosure table. Unassigned calls do not inherit a family from account totals. The first 5,000 grouped detail rows are shown with an explicit truncation state; the independent summary aggregates include all records.
- Provider receipts use the same selected period. Records holds their status, with raw IDs and full receipt tables inside Technical details. Exact app matches can establish feature and child attribution within received receipts. They do not establish full provider delivery or turn unmatched costs into an assigned family. Workspace, app and receipt failures remain isolated.
- The closed daily chart under Features and Models shows cost by day, stacked by model: the six models with the most cost get fixed colours in cost order, the rest are grey "Other models". Subscription calls add no cost. A table view sits under the chart.
- Cost by feature (groups in `FEATURE_GROUPS`) and cost by model (top 8, then one line for the rest).
- Families by AI cost, largest first, with the family's plan price per month (CAD, from `child_plan_states`: paying, or ending until its end date; a free month shows "free month") and the AI cost as a percent of that price for the same number of days (a month counts as 30.44 days; both in CAD). One line, "No family", holds team tools, tests, sample runs and history without a family.
- Cost per child per month, with the plan's charge and the margin: `/admin/ai/children` ("Cost per child" link in About these costs). See [Cost per child](child-unit-cost.md).
- The page uses one admin database read plus independent provider reads. It has no polling or prefetch. The database read uses the admin session. All provider and database reads run only after the existing admin gate succeeds.

## Per-child scope

`/admin/ai/children` retains its existing cost/margin summary, each family-local month, and separate speech/voice and printing estimates. It now includes all families. Each child has a disclosure of attributable app ledger rows by context, feature, provider/model and safe key identity. Older records without those dimensions remain in the summary with their existing limits. They are not distributed across invented models or keys. Family-only rows remain “No child assigned”. Account-only costs and local receipts awaiting import never become child costs.

## Retained receipts and historical recovery

`node scripts/import-ai-usage.mjs --file PATH` validates a recorder JSONL file and performs a dry run. Add `--apply` only for an authorized import after the migration is verified, with `SUPABASE_URL` and `SUPABASE_SECRET_KEY` configured in the operator's environment. No credential or receipt data is printed. Invalid receipts stop the import. Marking and explanation receipts are held before any file row is written, with a nonzero exit and an explicit incomplete-import message. Both features also write older spend ledgers, and a test context alone does not prove a distinct charge. Keep the file for an exact overlap check; no automatic import override is available. Other features can be placed in a separate file. The original receipt UUID and timestamp stay fixed. The import adds `imported_at`; imported records cannot move the legacy production cut-off. Independent practice, evaluation and test rows cannot establish that cut-off either. Unique receipt and generation indexes make repeated imports idempotent. Foreign-key failures stop the import; they are not treated as successful duplicates.

This importer handles retained recorder receipts only. Earlier practice traces with no provider id, price or trustworthy attribution cannot recover a detailed history. A provider receipt with no known child remains unassigned. Account balances alone cannot supply a historical model, feature, test/production or family split. Do not automatically import old aggregate cost estimates as exact provider receipts. No historical recovery has been run by this implementation task.

## Historical export evidence

Records also has a closed Historical exports section. It reads completed full snapshots
from separate append-only manifest, row and completion tables. It does not import CSV
rows into the app ledger or canonical provider receipts. The page date filter does not
apply because CSV row time zones remain unknown. Select one export at a time. Never
add overlapping exports or add them to ordinary totals. Source CSV amounts, the associated
analytics amount and their unresolved difference remain separate exact decimal strings.

The importer defaults to full offline validation with no database request. Root owns the
private controller manifest, real sources, hosted migration, generated schema files,
review, import and release. See [the implementation handoff](ai-cost-history-handoff.md)
for the package contract, safe retry procedure, local checks and remaining hosted gates.

## Required hosted steps before shipping

`AI_USAGE_HOSTED_STEPS_PENDING`

1. Root checks live migration history and timestamp uniqueness. Apply `20261116183028_ai_usage_scope_and_receipts.sql` additively. This keeps the existing RPC names and arguments and extends their JSON output. It retains the existing admin gate, grants, append-only rule, family/child fences and deletion relationships.
2. Root verifies the applied migration, new check constraints, duplicate receipt/generation behavior, non-admin refusal, and actual admin JSON output on the hosted platform. Local synthetic PostgreSQL is not hosted RLS proof.
3. Root runs `npm run db:types` and `npm run db:checks`. Commit both generated files in this PR. Add the new context/key/basis lists to `state-lists.test.ts` when the live constraints are available. Do not hand-edit generated files. No new typed RPC signature is needed; the existing functions return JSON.
4. Root configures `OPENROUTER_MANAGEMENT_API_KEY` securely for the Unica workspace and verifies its scope. Do not put a credential in the PR, browser props, console output or errors. The reader requires management analytics access. A failed query never falls back to account credits or another key.
5. Root finds reliable retained local receipts, runs the importer dry run, and authorizes any import. No aggregate backfill is permitted. Restart/rebuild long-lived workers with the new adapter and flush code after the migration is present.
6. Root completes two independent Sol reviews and settlement, green CI, browser validation, guarded merge and live verification. The implementation agent does not merge or deploy.

Root changes the marker to `AI_USAGE_HOSTED_STEPS_DONE` only after the required hosted work is complete.

## Offline validation for this candidate

- Final focused provider/report/recorder/child suite: 190 tests in 17 files, randomized with seed 1615.
- Wider focused run, including the Maya text and local CLI regressions: 1,021 tests in 40 files, randomized with seed 1613.
- Voice worker: 350 tests in 21 files. `npm run voice:typecheck` passed.
- `npm run typecheck` passed. Source ESLint (`npx eslint src`) and `git diff --check` passed.
- `node supabase/tests/ai_usage_scope.cjs` passed in a temporary synthetic PostgreSQL cluster. It checks full dimension sums, date/test scopes, sibling attribution, admin-test evidence, estimates, missing prices, legacy deduplication, duplicate ids, the 5,000-detail cap and the admin refusal. It does not verify hosted RLS or service credentials.
- The receipt importer dry run validated two repeated synthetic receipts as one distinct receipt. It performed no database request.
- Provider tests use fake bounded requests. No paid model calls, hosted writes, deployment, merge or browser checks ran in the implementation task. The full gate is left to CI and root.

## Review repair checks

- `node scripts/check-ai-usage-lifetime.mjs` builds a temporary production Next app and checks that the request recorder registers its write with `after`. It makes no hosted or provider request. `--source-ref c50772c234185b49a4c44c2b405c3cffc3d637d3` is the rejected-source control.
- `node supabase/tests/ai_usage_scope.cjs` includes earlier test imports followed by unrelated legacy production charges, unknown-context imports, and the existing live transition overlap. The expected total retains distinct charges without adding the known live overlap twice.

## Hosted verification, 2026-11-16

The reviewed migration was applied as live version `20261116192404`, name `ai_usage_scope_and_receipts` (local file prefix `20261116183028`). Generated types and checks come from that hosted schema. A rollback-only hosted probe passed admin overview and child reads, non-admin refusal, and duplicate receipt rejection. No probe charge remains. The import-hold recheck at `a3041dab8` passed Standards and Spec with no blockers or P2 findings. Historical marking/explanation import remains held pending exact overlap evidence. Production configuration, deployment and browser proof are still pending.
