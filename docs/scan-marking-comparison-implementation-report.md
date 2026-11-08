# Marking comparison implementation report

Computer: Savar's MacBook Pro (4), verified with `scutil --get ComputerName`.
Branch: `site/scan-marking-comparison-key`.
Worktree: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-0b4dee76`.
T3 path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-0b4dee76`.
Parent: `96e845e558aa867a27d355679b6e24871360a944`.

The implementation requires the dedicated marking key. It has no shared-key fallback or Keychain reader. The default is Sonnet 5.5. The marking-only override must have a mapped host. Production family access remains test/admin-only. The optional routing extension preserves the shared OpenRouter client's default behavior.

The comparison uses the fixed 13-model data list, the production marking job, prompt, strict schema, output reader and code scoring. It pins each requested endpoint. It disables fallbacks. It excludes observed suffix routes where a base slug could match another endpoint. Live catalog, endpoint and policy checks run before explicit paid dispatch. A changed or unavailable endpoint stops the run. There is no host substitution or per-model request logic.

The prepared additive migration uses the existing `scan-marking-global-budget` lock and `scan_marking_spend` ledger. It adds anonymous evaluation admission with the USD 15 run cap, shared USD 50 UTC-month cap, and a conservative USD 50 lifetime ledger check. It creates no family/photo records. It enables no prices. An HTTP attempt needs a saved reservation. Unknown cost keeps its hold. The transport envelope alone supplies cost. A crash or unresolved attempt blocks resume across every model.

The default retry count is zero. An explicitly permitted transport retry needs known usage and another saved reservation. The first photo for each model supplies measured input, image, output and reasoning usage. The tool projects the full remaining matrix with output and retry liability before a subsequent photo. Unknown usage or a projection above the run cap stops dispatch. No valid answer gets a second attempt to improve accuracy.

The report keeps parent-only two-ways separate. It reports wrong marks with the definite-mark denominator, all eligible items, wrong-as-right, overall and clear-photo unsure, failures/refusals/schema failures, missing cost, cost/page, latency p50/p95, actual provider, generation IDs, settings and hashes. D267 remains binding. The cheapest measured passing model requires all 13 fixed sets. It never changes production settings. Gemini Vertex safety retention and Alibaba's absent ZDR listing remain explicit.

## Fixed local photo artifacts

Final folder: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-0b4dee76/.workbook-sample/robin-fixed40-final`.

- `manifest.json`: SHA-256 `c206c70d6ea3b8cb8efcd59691bf90289227c0c3e8955b0ccd9a93bf39627497`.
- `index.html`: all 40 whole-page images with their truth rows.
- `contact-right.jpg`, `contact-wrong.jpg`, `contact-blank.jpg`, `contact-blurry.jpg`: all 40 images for inspection.
- `synthetic-coverage.json`: 40 unique photos, 30 clear photos, 296 truth rows, 292 automated items and 4 parent-only rows.
- Coverage: whole 184; fraction 4; decimal 4; tick-and-number 8; circle 52; show-work final 24; spot error 12; words 4; two-ways 4.
- `estimate.json`: offline estimate, all endpoint evidence hashes and conservative per-attempt bounds.

The source PDF hash is `d95cec84ed1cd4780e9fef18dd18faf6e02dfa736e02b0e1de1f01bc122b5659`. Every source page hash matches its measured contract. Every final JPEG hash was checked against the same 40-photo manifest. The loader checks JPEG dimensions, metadata removal, fixed source identity, source hashes, measured regions, every truth row, format coverage and hard controls. I inspected the four contact sheets and the fraction/decimal/words/choice/tick pages at full size. This proves only synthetic artifact construction and geometry. It proves no provider recognition or real handwriting accuracy.

These artifacts are ignored local files. They are not in the commit. Root must copy the final folder if it needs another checkout or external evidence folder. This task made no external writes.

## Changed paths

`src/lib/ai-openrouter.ts`, `src/lib/scan-marking-ai.ts`, `src/lib/scan-marking-ai.test.ts`, and `src/lib/scan-marking.ts` add isolated key use, optional pinned routing and public production request/output validation.

`src/lib/scan-marking-comparison.ts`, `src/lib/scan-marking-comparison-run.ts`, `src/lib/scan-marking-comparison.test.ts`, and `src/lib/scan-marking-comparison.test-fixtures.json` add policy/manifest/scoring/projection rules, durable production-path execution and focused tests. The fixture packages contain only the supplied fake Robin/sample data.

`scripts/scan-marking-comparison.mjs`, `scripts/scan-marking-comparison-cli.ts`, `scripts/scan-marking-synthetic-photos.ts`, and `scripts/tsconfig.scan-marking.json` add the CLI, deterministic synthetic photo builder and focused type check.

`data/scan-marking-models.json` and `data/scan-marking-endpoint-evidence-20261106.json` hold the authorized pairs and bounded public endpoint/ZDR records with original snapshot hashes.

`supabase/migrations/20261106_scan_marking_evaluation.sql` and `supabase/tests/scan_marking_evaluation.cjs` hold the unapplied SQL and prepared disposable local probe. `docs/scan-marking-comparison.md` and this report document the operation and limits.

## Focused checks

All checks ran on this Mac. No check used a real provider.

```bash
npx vitest run src/lib/scan-marking-comparison.test.ts src/lib/scan-marking-ai.test.ts src/lib/ai-openrouter.test.ts src/lib/scan-marking.test.ts --maxWorkers 2
npx tsc -p scripts/tsconfig.scan-marking.json --pretty false
npx eslint src/lib/ai-openrouter.ts src/lib/scan-marking.ts src/lib/scan-marking-ai.ts src/lib/scan-marking-ai.test.ts src/lib/scan-marking-comparison.ts src/lib/scan-marking-comparison-run.ts src/lib/scan-marking-comparison.test.ts scripts/scan-marking-comparison-cli.ts scripts/scan-marking-comparison.mjs scripts/scan-marking-synthetic-photos.ts
node --check supabase/tests/scan_marking_evaluation.cjs
git diff --check
```

Result: 4 test files and 181 tests pass. Focused TypeScript, changed-code lint, probe JavaScript syntax and diff whitespace checks pass. Key/transport tests prove dedicated-key isolation and identical strict production requests. They pass through fake HTTP only. Manifest/photo checks prove the synthetic set and frozen geometry; they do not prove physical photos. Budget tests prove durable client admission, unknown-cost refusal and RPC response handling; they do not execute the SQL lock. The SQL probe has eight prepared cases for shared-ledger limits, unknown holds, exact-once admission, settlement, concurrent admission, the production budget lock and role permissions. It has not run.

An earlier repository-wide standalone `tsc --noEmit --incremental false` failed because the fresh checkout lacks generated Next.js `PageProps`, `LayoutProps` and route types. The focused type check passes. Root's normal build remains required. No full suite, Next build, browser, Chromium or workbook generator ran in this task. The photo builder used Sharp with concurrency 2 and the existing rendered PNGs only.

## Root gates

Root owns independent review, SQL execution, hosted verification, generated types, full gates and any paid run. The migration and generated database types are not applied or updated here. After review, root must run the prepared probe on a disposable local cluster, apply and verify the additive migration, enable reviewed evaluation bounds, and run `npm run db:types`.

```bash
SCAN_MARKING_SOCKET=/tmp/pd542-pg-EXAMPLE SCAN_MARKING_DATABASE=pd542_evaluation node supabase/tests/scan_marking_evaluation.cjs --bootstrap
npm test -- --maxWorkers 2
npx eslint src
npm run build
npm run dev
```

The SQL command needs a new cluster/socket and database with those prefixes. Replace the example socket with the real disposable socket. Root must check hosted grants, function search paths and serialization against documented platform limits. Root owns the browser check after `npm run dev`. No generator or another book is needed for this change.

Run the offline estimate from this checkout:

```bash
node scripts/scan-marking-comparison.mjs --estimate --manifest .workbook-sample/robin-fixed40-final/manifest.json --snapshots /Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/comparison --out .workbook-sample/marking-comparison-results
```

The fixed plan hash is `657e47ebdacaa99d305dde8cb97f2c239a66f4571879971948ccb83e04612276`. The default matrix has 520 requests. Context-sized first-photo reservation bounds total USD 7.265856. This is a conservative liability bound, not measured spend or the expected bill. The user-supplied USD 1.54 and USD 8.42 estimates remain unverified 4000-input-token planning figures. The tool reports `dispatchReady: false` until root completes the separate gates.

Proposed paid invocation, for root only after its approvals and credential setup:

```bash
node scripts/scan-marking-comparison.mjs --run --max-usd 15 --max-attempts 1 --manifest .workbook-sample/robin-fixed40-final/manifest.json --snapshots /Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/comparison --out .workbook-sample/marking-comparison-results
```

No inference, key read, hosted write, migration application, family switch, push, PR or merge ran. No Maya, generator, template, package, plan, curriculum, render source, agent instruction, skill or settings file changed. Production privacy work remains deferred. No PR created.
