# Scan marking preflight update

IMPLEMENT_DONE_MARKING_PREFLIGHT_UPDATE

The implementation is ready for root review. No paid inference ran. No hosted price or configuration changed.

## Checkout and scope

- Machine: `Savars-MacBook-Pro-5.local`.
- Provider and model: Unify Codex, `gpt-6.1-sol`, high reasoning effort.
- Branch: `t3/scan-marking-preflight-price-refresh`.
- Prepared path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-9df442ab`.
- Resolved path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-9df442ab`.
- Exact base: `e53bc49601d9ed6e1bde7294c4ab7879e419ce4d`. The clean prepared checkout fast-forwarded from `96e845e558aa867a27d355679b6e24871360a944`.
- No PC worker, subagent, credential lookup, paid model call, hosted write, push, PR or merge was used.

The fixed list still has 13 pairs. Only MiMo changed host: `DeepInfra` / `deepinfra/fp8` to `Makora` / `makora/fp8`. The list hash is `1c61503c7d953b7c6427312dc88b9651a0a0647d2313a30425c81f4b886de5a2`. Cohere is absent.

The production marking request, strict state validator, D267 thresholds, family flags, production model configuration, privacy configuration, print source, Maya source and generated database types have no changes in this task.

## Changed behavior

`assessComparisonEndpoint` records one ready or blocked state per model. A provider, capability, quantization, suffix exclusion or retention change blocks that model. A price-only change refreshes evidence and the conservative reservation. Qwen remains explicitly `not-zdr`. The three Gemini pairs remain `safety-retention`.

`runComparisonMatrix` probes each available pair on the same first photo. It projects complete remaining model sets in ascending projected cost. It blocks a model if its projection or next reservation cannot fit the run cap. Other available pairs can continue. All charged attempts remain in the total, including attempts for a model later blocked.

The report lists blocked and incomplete models. It can select the cheapest fully tested passing available pair. A selected pair must have all 40 photos and pass all D267 controls. A blocked model cannot pass or be selected. An undispatched blocked model has no inferred marks or cost per page. A partly tested blocked model retains its measured total cost when known.

The plan keeps the approved snapshots fixed. Fresh evidence versions go into a durable history. Results retain their dispatch evidence hash. Resume verifies model, host, photo hash, request hash and evidence identity. It does not repeat settled photos. Saved model blocks remain in the run.

Unknown cost or token usage stops all paid dispatch. Unknown cost never becomes zero. The CLI checks the complete journal after each result. A settlement or journal failure stops the run. A refusal without a reservation has no charged liability and cannot authorize a blind retry.

## Proposed SQL for root

The original evaluation migration is already hosted as version `20261106215033`. This task does not apply another hosted migration or generate types.

Prepared file: `supabase/migrations/20261106220640_scan_marking_evaluation_price_refresh.sql`.

`refresh_scan_marking_evaluation_price` requires an existing enabled reviewed anchor for the same model and endpoint. Root must save the exact compact `JSON.stringify(EndpointEvidence)` text in that anchor's `evidence` field. Its SHA-256 must equal the anchor hash. The CLI estimate now includes the evidence object for this purpose.

The RPC verifies the refreshed text hash and compares its non-price route and policy fields with the anchor. It independently computes the full context-sized reservation. It uses the highest tier, image, cache-write and reasoning rates and 4096 output tokens. It accepts the mathematical ceiling or one extra microdollar for conservative JavaScript rounding. It preserves the reviewed pixel limit. The reservation RPC still requires the exact new evidence hash and maximum.

`reserve_scan_marking_evaluation_checked` takes the same global budget lock. It refuses new evaluation dispatch while any evaluation charge remains unknown, including a charge from another run or month. It then calls the existing admission function. The USD 15 run cap, shared USD 50 UTC-month cap and conservative USD 50 key lifetime cap remain binding. The original production admission function is unchanged.

The migration enables no initial price and grants no direct table writes. The new RPCs allow only `service_role`. The policy helper is not callable by browser roles or `service_role`.

Root must review and apply this migration, generate official database types, verify hosted permissions and platform behavior, and enable the initial reviewed bounds before any paid run. Use the checked admission RPC through this CLI. Do not replace the fixed snapshot folder during a resume.

## Public evidence and fixed assets

The live GET-only CLI preflight at `2026-11-06T22:11:47.800Z` found 13 ready pairs and zero blocked pairs. This proves advertised availability only. It does not prove inference or correct marking.

- MiMo: exact API provider `Makora`, endpoint `makora/fp8`, status 0, image input, `response_format` and `structured_outputs`, ZDR listed, `safety_retention: false`. Input/output: USD 0.14/0.28 per million tokens.
- GLM: exact API provider `Wafer`, endpoint `wafer/us`, status 0, the same required capabilities, ZDR listed without safety retention. Input/output: USD 0.0406/0.212 per million tokens.

Primary sources: [MiMo endpoints](https://openrouter.ai/api/v1/models/xiaomi/mimo-v2.6-flash/endpoints), [GLM endpoints](https://openrouter.ai/api/v1/models/z-ai/glm-5.3-flash/endpoints), [ZDR endpoints](https://openrouter.ai/api/v1/endpoints/zdr), [catalog](https://openrouter.ai/api/v1/models). Public metadata is not a legal retention guarantee.

All proposed raw snapshots and local proof remain inside the ignored checkout folder:

`/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-9df442ab/.workbook-sample/preflight-update/`

Root can copy these files from that folder:

- `*-endpoints.json`, `zdr-endpoints-20261106.json`, `catalog-20261106.json`, `checked-at.txt`: raw public GET snapshots from `2026-11-06T22:02:41.519Z`.
- `proposed-public-evidence.json`: proposed curated public evidence. The tracked evidence refreshes only MiMo and GLM; other curated rows retain their prior collection date.
- `refreshed-estimate.json`: exact initial hashes, evidence objects and conservative bounds. The first-probe upper bound is USD 7.271528. This is not a measured spend or cost per page.
- `asset-proof.json`: fixed manifest hash, counts and initial bounds.
- `runs/8a8e33848320942bdc7e30186608476049767b7861648480d982b22bc39ce429/`: immutable plan, fresh public snapshots, preflight, evidence history, model states and report. No inference result or attempt exists there.

The external root comparison folder was read-only. The fixed manifest remains at `/Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/comparison/robin-fixed40/manifest.json`. Its file SHA-256 is `c206c70d6ea3b8cb8efcd59691bf90289227c0c3e8955b0ccd9a93bf39627497`. It has 40 photos, 30 clear photos, 296 truth rows, 292 automated rows and 4 parent rows. The CLI validated all JPEG hashes, metadata and frozen source contracts. No image or truth row changed.

## Checks and proof limits

The concrete falsifiers were: any dispatch to a blocked pair; use of an old price hash or maximum after refresh; changed photos or request settings; dispatch after unknown liability; repeated settled dispatch on resume; a blocked model selected as passing; a D267 failure or an array-valued state accepted as valid.

Final focused command:

```bash
npx vitest run src/lib/scan-marking-comparison.test.ts src/lib/scan-marking.test.ts src/lib/scan-marking-ai.test.ts src/lib/ai-openrouter.test.ts --reporter=dot
npx tsc --noEmit -p scripts/tsconfig.scan-marking.json
npx eslint src/lib/scan-marking-comparison.ts src/lib/scan-marking-comparison-run.ts src/lib/scan-marking-comparison.test.ts scripts/scan-marking-comparison-cli.ts
```

- Comparison and transport: **202 tests passed in 4 files**. They prove the public fake-transport controls, identical request settings, local model blocks, refreshed projection, resume identity, report selection, D267 hard failures and strict state validation. They do not prove paid host behavior or real handwriting accuracy.
- Types and lint: both passed. They prove the focused comparison code typechecks and satisfies lint. They do not prove the full application build.
- Existing SQL: **8 cases passed** on disposable PostgreSQL 18. They prove the existing local budget, lock, settlement and role controls. They do not prove hosted permissions.
- New SQL: **17 cases passed**. They prove a refreshed price can reserve with its exact new evidence and bound, disabled-anchor refusal, changed-policy refusal, highest-tier liability, global unknown-cost refusal, caps, concurrent refresh/admission and local role permissions. They do not prove hosted PostgREST or platform grants.
- Assets and public preflight: the real CLI validated all fixed local assets and performed public GETs. It made no inference call and wrote no hosted configuration.

Logs in the ignored proof folder: `focused-tests.log`, `typecheck.log`, `lint.log`, `sql-base.log`, `sql-refresh.log`, `live-preflight-path.txt`. The disposable database server was stopped after the SQL checks.

The initial SQL probe exposed a test setup conflict: a run-budget refusal had already stored that test run's cap. The corrected probe uses separate run identities for the monthly and lifetime cases. The final probe ran on a new disposable database.

Baseline logs were read, not repeated. Root's `local-test.log` records 17,000 passed and 1 skipped. Root's `686-integration-focused.log` records 189 passed in 6 files; this file does not contain the 193 count from the brief. No full suite, full application build, browser or Chromium ran in this task. Root owns those checks and independent review.

## Root repairs after Sol R3 and launch R1

R3-01: TypeScript and the unapplied SQL refresh now include cache-read rates from the base price and all tiers. An explicitly unknown tariff is refused. New SQL controls verify the exact 12,583,781-microdollar bound and refuse admission after a prior 14,956,000-microdollar charge. No new provider request can rely on the old 43,441-microdollar bound.

R3-02: Any journal begin or save failure sets a fatal state. Retry admission checks this state before another reservation. The result retains its charged attempt, known usage and failure. Matrix dispatch and later resume reject this fatal result. The same stop applies to unresolved reservation or settlement failures. Fake HTTP controls cover response failures with one and two attempts, plus begin, reserved and settled journal failures.

Launch R1: server readiness uses the same trimmed runtime model override and default as the actual client. Synthetic complete evidence for Sonnet becomes stale when GLM is selected. The permanent family hold is unchanged.

D-267 reference order: the first available Sonnet probe runs before the other first-photo probes. The fixed thirteen-pair data and every request remain unchanged. A public order test failed before this repair.

Root comparison regressions first produced five failures. After repairs, 290 focused tests passed in eight files. The standalone TypeScript check and changed-file lint passed. The disposable PostgreSQL probe passed eight inherited and 21 refresh cases. Its server stopped. These checks prove local fake transport, tariff bounds, admission, retry and source-evidence behavior. They do not prove hosted permissions, live model accuracy or physical photos.

The customer comment batch remains active. No full Chromium gate, paid call, key read, hosted write, push, merge, family switch or print change ran. The price-refresh migration remains unapplied. Root extends the comparison review budget from three to five under the state/concurrency exception for the reproduced budget and journal failures. Budget end is not approval. A new scoped Sol review must cover the repaired behavior and launch mismatch.
