# Synthetic marking comparison

This tool is closed to real child data. It does not change family access or select a production model. The fixed list is `data/scan-marking-models.json`. It contains the 13 model and endpoint pairs supplied on 6 November 2026.

MiMo uses only `Makora` / `makora/fp8`. The 6 November public refresh lists status 0, image input, `response_format`, `structured_outputs`, and ZDR without safety retention. Its input/output rates are USD 0.14/0.28 per million tokens. GLM stays on `Wafer` / `wafer/us`, at USD 0.0406/0.212 per million. See the [MiMo endpoint API](https://openrouter.ai/api/v1/models/xiaomi/mimo-v2.6-flash/endpoints) and [GLM endpoint API](https://openrouter.ai/api/v1/models/z-ai/glm-5.3-flash/endpoints). The tool never substitutes another host.

Marking requires `SCAN_MARKING_OPENROUTER_API_KEY`. It never uses `OPENROUTER_API_KEY`. `SCAN_MARKING_MODEL` is the marking-only override. Sonnet 5.5 is the default. An unmapped model fails closed. Existing `SCAN_MARKING_ENABLED=test-only` access and the production price guard remain in force. This tool has no Keychain reader.

## Assets

The source folder must contain `synthetic-draft.json`, `fixture-manifest.json`, and `rendered-workbook.json`. The last file must contain the renderer's `workbook` object, including the PDF hash, measured regions and page contracts. This selected-page test booklet has no production approval or registered QR IDs. `syntheticPrintRevision()` freezes its complete measured source as a test-only revision. It never invents a contract for a stored book or renders a book.

`--make-photos` makes four fixed variants for each of the ten exercise pages: right, wrong, blank, and blurry. It draws code-defined strokes, detects the printed option positions from page pixels, adds final-answer and work-space controls, and writes JPEGs, labels, an HTML inspection index and contact sheets. It requires the synthetic source PDF hash and each source page hash to match their frozen contracts. The result has 40 photos, 30 clear photos and 296 truth rows. Two-ways stays parent-only. These are synthetic digital images, not physical handwriting photos.

```bash
node scripts/scan-marking-comparison.mjs --make-photos /absolute/synthetic-booklet --out /absolute/new-local-photo-folder
```

Prepare 40 metadata-free JPEG whole-page images from the separate made-up Robin booklet. Keep their dimensions equal to the rendered page image. Prepare a proposal JSON with these fields:

```json
{
  "version": 1,
  "synthetic": true,
  "identity": {
    "name": "Robin", "madeUp": true, "containsRealData": false,
    "profileSource": "sampleChild/samplePlanInput"
  },
  "source": { "synthetic": true },
  "photos": [{
    "id": "synthetic-page-4-wrong", "pageNumber": 4, "clear": true,
    "image": { "path": "photos/synthetic-page-4-wrong.jpg", "metadataFree": true },
    "truth": [{
      "itemId": "the exact package id from this rendered page",
      "format": "fraction", "result": "wrong",
      "readings": [{ "regionId": "answer", "state": "written", "text": "2/9", "issue": null }]
    }]
  }]
}
```

Supply every item on every page. The example is incomplete. `--prepare` rejects it. The proposal needs 40 unique photo IDs and image hashes. The tool fills frames from the frozen rendered pages. It fills image dimensions and source/image hashes. It checks the supplied labels against the production reader. It requires all nine format groups: whole number, fraction, decimal, tick and number, circle, show-work final answer, spot error, words, and parent-only two-ways. It also requires right, wrong, blank, uncertain, and parent controls. Region IDs and order must match `markingRegions()`. Two-ways rows use `result: "parent"` and an empty readings array. They never count as automatically correct. Wrong word readings can remain unsure under the production rule.

An uncertain label needs one allowed issue: `unreadable`, `crossed-out`, `multiple-marks`, `missing`, `blurry`, `cut-off`, `incomplete`, or `answer-form`. A blank label needs empty text and a null issue. A clear-photo label is a statement about image quality, not the correctness of its answer.

The old `scan:photo-set` whole-number set is insufficient. Synthetic ink does not prove real handwriting accuracy. The customer approval sample is prohibited.

```bash
node scripts/scan-marking-comparison.mjs --prepare /absolute/synthetic-folder/proposal.json --out /absolute/synthetic-folder/manifest.json
node scripts/scan-marking-comparison.mjs --estimate --manifest /absolute/synthetic-folder/manifest.json --snapshots /absolute/comparison-folder --out .workbook-sample/marking-comparison
```

## Admission and dispatch

Root must review and apply `20261106_scan_marking_evaluation.sql`. Then root must generate database types, verify hosted permissions and the shared lock, and enable reviewed evaluation price bounds. No bound is enabled by the migration. Each bound identifies the exact model, endpoint, evidence hash, maximum pixels, and maximum cost for one request. `--estimate` reports context-sized conservative bounds. Verify image-inclusive pricing, tier prices, cache-write liability, and 4096 output tokens before enabling them. The existing production prices remain separate and unchanged.

The price refresh also requires `20261106220640_scan_marking_evaluation_price_refresh.sql`. Root owns its hosted application and type generation. Root must store the exact compact `JSON.stringify(EndpointEvidence)` text in each initial reviewed bound's `evidence` column. The hash must match this text. `--estimate` includes this evidence object. No refresh can enable an absent or disabled initial bound.

The service-only `refresh_scan_marking_evaluation_price` RPC verifies the refreshed text's SHA-256. It requires the same reviewed provider, endpoint, quantization, parameters, context limits, suffix exclusions and retention policy. It computes the full context-sized input bound and 4096-token output bound from the highest published tier, image, cache-write and reasoning rates. It accepts only that bound, with at most one extra microdollar for conservative floating-point rounding. The exact new hash and maximum must then pass durable admission. It preserves the reviewed pixel limit. It adds no direct table write grant.

Every HTTP attempt reserves in `scan_marking_spend` under the existing `scan-marking-global-budget` lock. This preserves the USD 50 UTC-month cap. Evaluation admission also checks the key's conservative USD 50 lifetime ledger total and the immutable run cap, at most USD 15. The provider key's USD 50 total limit remains an additional external control. No family or photo rows are required. Unknown costs keep their holds. Settlements accept only HTTP transport usage. Model response JSON cannot supply a cost.

Root supplies credentials through the process environment only after approval. The command never retrieves or prints them:

```bash
node scripts/scan-marking-comparison.mjs --run --max-usd 15 --max-attempts 1 --manifest /absolute/synthetic-folder/manifest.json --snapshots /absolute/comparison-folder --out .workbook-sample/marking-comparison
```

The default is one attempt. An optional second transport attempt needs `--max-attempts 2`. It can run only after a retryable error with known usage and a new durable reservation. It cannot replace a valid answer to improve accuracy. Missing cost or token usage stops the run. Missing reasoning-token detail also stops it; absence is not assumed to mean zero. Image tokens are saved separately when provided. `prompt_tokens` is the image-inclusive input count used for the projection.

The tool first checks the live public model catalog, exact endpoints, and ZDR list. An unavailable endpoint, missing capability, changed quantization or changed retention policy blocks that model. A lost previously accepted ZDR listing blocks that model. A price change alone refreshes its evidence, reservation and projection. Other available pairs can continue. Public telemetry changes do not change the approved route policy. A model whose bound cannot be verified stays blocked. Every model uses the production `runScanMarking` request, strict schema, `readMarkingOutput`, and code scoring. The request has the full page, local aliases and boxes. Truth rows, keys and identity fields stay outside it.

Use `--preflight` in place of `--estimate` for a public GET-only live check. It writes evidence and model states. It does not read credentials, configure prices, or dispatch inference.

All available models first receive the same first photo. A first reservation above the remaining run cap blocks that model. The tool then projects complete remaining model sets from measured image-inclusive input tokens, maximum output liability, selected retry count, and all prior costs. It admits these sets in ascending projected cost. A missing or over-cap model projection blocks that model. It records every block. Atomic SQL admission remains binding even when a projection is lower than the actual next request.

Each attempt has an exclusive, synced local file and an anonymous database attempt hash. A crash or unknown attempt does not grant new dispatch permission on resume. Keep the same manifest, snapshots, output directory and settings to resume completed work. A held attempt without a result requires root to reconcile its saved generation and ledger evidence. The runner does not clear it or replay it automatically.

Unknown cost stops all paid dispatch. It is never zero. The checked evaluation admission RPC also refuses new dispatch across run hashes while any evaluation cost remains unknown. A journal or settlement failure stops all models. A known refusal with no reservation has no charged liability. Saved blocks remain in this run. The evidence history records each refreshed version, so settled results keep their original evidence hash. Resume verifies each result's model, endpoint, photo hash, request hash and saved evidence identity before dispatch.

## Results and policy

The output directory is the SHA-256 of the fixed plan. It contains the plan, fresh public snapshots, preflight, first-photo projection, transport envelopes, generation IDs, results and `report.json`. The report gives wrong marks and their definite-mark denominator, all eligible items, wrong answers marked right, overall unsure, clear-photo unsure and denominator, parent methods, missing/invalid/schema failures, refusal reasons, actual served providers, cost/page with missing cost explicit, retries, and latency p50/p95. Latency includes failed dispatched photos. Costs include failed responses and retries. Hashes identify model settings, prompt, photos, endpoint evidence, and truth manifest.

D267 requires at most 1 percent wrong definite marks, zero wrong answers marked right, and at most 5 percent unsure on clear photos. Unsure items do not dilute the definite-mark denominator. Missing, invalid, refused, schema-invalid, wrong-provider or unknown-usage results cannot pass. Selection can identify the cheapest fully tested passing pair among available models. Every selected pair must have all 40 fixed photos. The report explicitly lists blocked and incomplete models. It gives no cost per page or inferred marks for an undispatched blocked model. A blocked model cannot pass or be selected. This selection never changes family access or production settings.

Google Vertex's API provider name is `Google`. The three Gemini endpoints have safety retention in the saved ZDR metadata. They are reported as `safety-retention`, not `strict-zdr`. Alibaba Qwen 3.8 is reported as `not-zdr`. Missing retention detail is `unverified-retention`. Public metadata is evidence of the advertised policy, not a legal retention guarantee. Savar must see the actual passing host policies and explicitly choose before real child photos are allowed.

[OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection) documents `only`, `order`, full endpoint slugs, `allow_fallbacks: false`, `require_parameters`, and `zdr`. Base slugs can match endpoint variants. The comparison therefore also excludes all observed suffix endpoints under a pinned slug. A newly observed suffix changes preflight evidence and blocks that model. The production default excludes flex and priority routes.

## Checks

The implementation task runs only focused unit and type checks. Root runs the SQL probe on a new disposable local database after printing is idle:

```bash
SCAN_MARKING_SOCKET=/tmp/pd542-pg-EXAMPLE SCAN_MARKING_DATABASE=pd542_evaluation node supabase/tests/scan_marking_evaluation.cjs --bootstrap
SCAN_MARKING_SOCKET=/tmp/pd542-pg-EXAMPLE SCAN_MARKING_DATABASE=pd542_evaluation node supabase/tests/scan_marking_evaluation_price_refresh.cjs
```

The local SQL probe cannot prove hosted grants. Root must verify those on the hosted project after applying the reviewed migration and running `npm run db:types`. Then root runs the repository done gate and checks the page through the approved browser workflow. No release flag is changed by these commands.
