# Robin physical-photo evaluation

This local tool accepts photos of the frozen, made-up Robin booklet. It runs Sonnet 5.5 on `google-vertex/global` and Terra 6.1 on `azure` on the same photos, human truth, prompt, reader, scorer and D-267 bar, with fallbacks off. It reports them side by side. It does not register its QR tokens. The QR website route does not work for this kit. It does not change production admission, family flags, fixed40, D267, or the selected production model. It selects no model.

The default command is free. Preparation, template output, estimates, fake HTTP checks, and saved replay need no key or database. Only `--run` permits provider and ledger requests. Do not use real customer inputs.

## Inputs

Use this unchanged kit:

```text
/Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/synthetic-booklet
```

The tool verifies the supplied PDF, rendered JSON, and fixture manifest hashes. It verifies all 12 existing page images against their measured contracts. It uses the 10 exercise pages and their 74 questions. The original build used fake generation with `sampleChild/samplePlanInput`. It stored no book. See the kit's read-only `build-fixtures.ts` and README.

This kit has no published print revision or manifest. `syntheticPrintRevision()` freezes the measured rendered input. This is an evaluation identity. It is not a published book identity. The tool uses existing measured boxes. It does not render a page or make geometry.

Put the original photos in one local folder. Keep the completed truth CSV outside that folder. Do not use subfolders or symlinks. Add `photos.json` in the photo folder:

```json
{
  "version": 1,
  "madeUpRobinOnly": true,
  "photos": [
    { "file": "iphone-page-2.jpg", "pdf_page": 2, "device": "iphone", "clarity": "clear" },
    { "file": "android-page-2.jpg", "pdf_page": 2, "device": "android", "clarity": "clear" },
    { "file": "iphone-page-2-blur.jpg", "pdf_page": 2, "device": "iphone", "clarity": "unclear" }
  ]
}
```

This example is incomplete. Each phone must cover all 10 exercise pages. `pdf_page` is the 1-based position in the 12-page PDF. It differs from the original workbook's printed page number. Add every photo and every control to the map. The tool reports an absent page for either phone. It reports missing, extra, unreadable, or refused files. Any such input prevents a pass. A full run cannot pass by omitting a refused photo. At most 200 mapped photos are permitted.

Use `iphone` or `android` for `device`. The operator must label `clarity` as `clear` or `unclear`. There is no default clarity label. Use a simple file name with letters, digits, underscores, hyphens, and periods. Supported extensions are jpg, jpeg, png, webp, heic, and heif. The local Sharp installation must support the actual image encoding. An unsupported HEIC file is refused. Preserve the original file and its hash.

## Human truth

Generate the extended template before inference:

```sh
node scripts/scan-marking-physical.mjs --template \
  --kit /Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/synthetic-booklet \
  --photos /absolute/robin-phone-photos \
  --out /absolute/new-robin-template
```

Complete `/absolute/new-robin-template/human-truth.csv` independently. Read the actual writing in each photo. Do not copy model output into truth. Do not copy truth from another photo when its writing is unclear.

The kit's nine columns remain: `pdf_page,printed_page,page_id,question,format,methods_required,final_written_answer,intended_result,notes`. The extension adds these columns:

| Column | Contract |
| --- | --- |
| `photo` | Exact mapped file name. |
| `item_id` | Exact frozen package ID. Keep the generated value. |
| `region_id` | Exact scored region ID. Keep the generated value. |
| `reading_state` | `written`, `blank`, or `uncertain`. |
| `reading_issue` | Required for uncertain readings. Empty for written and blank readings. |
| `photo_clarity` | The operator's map label. It must match the map. |
| `device` | The operator's map label. It must match the map. |

The generated template has one row per scored region in each photo. A tick-and-number item has two region rows. A two-ways item has three: `method-1`, `method-2` and `answer`. Repeat the same item-level `intended_result` on all rows of an item. The frozen kit gives 81 region rows per complete phone series. Two phone series give 20 photos, 162 rows and 148 item labels: 148 AI-marked and 0 parent. Additional photos add their own complete rows and items.

For `written`, supply the visible final text in `final_written_answer`. For a choice, supply its printed choice label. Use `right` or `wrong` as the item result. For `blank`, leave the final text and issue empty and use result `blank`. For `uncertain`, use result `uncertain` and an issue from this list: `unreadable`, `crossed-out`, `multiple-marks`, `missing`, `blurry`, `cut-off`, `incomplete`, `answer-form`, `method-form`. The final text may be empty when it cannot be read. A visible partial transcription may be supplied with an uncertain reading.

For a `method-1` or `method-2` row, write the work as it appears in `final_written_answer`, one step per line. Use `uncertain` with `method-form` when the work is a drawing or words. The item result is your own judgment: right only if the answer is right and both methods are present and valid. No row can use `parent`.

The tool requires the full generated row set. It rejects duplicate, missing, extra, inconsistent, or incomplete rows. It rejects malformed CSV quoting. It checks human readings through the existing strict output validator and reader for consistency. On a two-ways item a human right or wrong stands, even when code's check differs: the report counts that difference. It never supplies a missing transcription or mark from a stored key. A different word answer can remain pending under the existing reader rule.

## Free preparation and estimate

One operator command checks all inputs and writes the estimate and initial score report:

```sh
node scripts/scan-marking-physical.mjs --estimate \
  --kit /Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/synthetic-booklet \
  --photos /absolute/robin-phone-photos \
  --truth /absolute/completed-human-truth.csv \
  --out /absolute/new-robin-estimate
```

Omitting `--estimate` has the same free behavior. The output folder must be new or empty. It must be outside the input folders. An existing run cannot be resumed as a new run.

The tool saves raw hashes before image checks. `normalizeScanPhoto()` applies EXIF orientation, preserves aspect ratio, bounds image size, removes metadata, and decodes the QR. Calibration checks the four corners, page ink, QR location, and page identity. `sheetChecker()` checks all other frozen exercise pages for a conflicting sheet. The tool uses `straightenedPage()`, `cropPlan()`, and `cropBox()` after these checks. It sends one whole straightened page. It does not send separate crops to the model.

Image failures stay in `report.json`. A CSV or source failure writes `validation-report.json`. `inventory.json` retains file hashes and input failures. `set.json` uses version `robin-physical-v2`. The set hash is distinct from fixed40. `plan.json` binds the set, original and normalized hashes, truth, measured frames, request/schema, source dependencies, route evidence, and settings. The source lock includes local transitive imports and `package-lock.json`.

The estimate uses saved public endpoint evidence. The expected cost is 4,000 input and 1,500 output tokens per request at each pinned base price, about twice the measured v7 cost: USD 0.69 for 20 photos on both models. It is not an actual charge. It does not claim current live liability. The tool prints it before any paid call and stops when it is over the USD 15 stop or `--max-usd`. Only paid atomic admission reads that liability. There is no stored spend baseline.

## Local fake example

These commands copy the existing blank kit images. They do not render or alter the kit. Their blank labels describe known empty synthetic print regions. They are not human truth for phone photos.

```sh
node scripts/scan-marking-physical.mjs --example \
  --kit /Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/synthetic-booklet \
  --out .workbook-sample/robin-phone-example

node scripts/scan-marking-physical.mjs --fake-http \
  --kit /Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/synthetic-booklet \
  --photos .workbook-sample/robin-phone-example/photos \
  --truth .workbook-sample/robin-phone-example/fake-truth.csv \
  --out .workbook-sample/robin-phone-fake-proof

node scripts/scan-marking-physical.mjs \
  --replay .workbook-sample/robin-phone-fake-proof \
  --out .workbook-sample/robin-phone-replay-proof
```

Use new output names if those folders exist. Fake HTTP uses the production request, transport, journal, schema validator, and reader with a local in-memory ledger. It sends no HTTP request. It has one built-in control: Terra is unsure of the first method on each two-ways item, so the report shows a disagreement. A fake score proves local interpretation only. Saved replay reads the saved raw HTTP envelopes and terminal journals. It performs no inference. It validates result ownership and re-runs the same reader. Its proof class is `saved-reader-replay`.

## Explicit paid path

Root owns review, the full gate, publication, migration application, price verification, credentials, and the actual paid run. No paid run was made by the implementation task.

The existing evaluation RPC limits each run to USD 15. It cannot atomically enforce an aggregate USD 15 across different runs. A read before reservation cannot close that concurrency gap. The additive migration `20261107_scan_marking_physical_evaluation.sql` supplies `reserve_scan_marking_physical_evaluation_checked`. It uses the existing global budget lock and existing evaluation admission. Root must apply and verify it before a paid run. It changes no existing production function or price. No hosted change is made by this tool.

The new RPC sums all recorded marking charges and retained holds across all periods and runs. It includes relevant production test charges. It conservatively includes other production charges too. Unclassified unknown production or evaluation liability stops dispatch. A classified clean 429 retains its reservation. Existing run, shared monthly USD 50, dedicated-key total USD 50, verified-price, and no-blind-retry checks remain binding. The tool creates no key or cap.

After root supplies the existing dedicated marking key and ledger service key through the environment:

```sh
node scripts/scan-marking-physical.mjs --run --max-usd 15 \
  --kit /Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/synthetic-booklet \
  --photos /absolute/robin-phone-photos \
  --truth /absolute/completed-human-truth.csv \
  --out /absolute/new-robin-paid-run
```

The required names are `SCAN_MARKING_OPENROUTER_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. The tool does not retrieve credentials. It does not use `OPENROUTER_API_KEY`. There is no alternate key or provider fallback.

The fixed test pairs are Sonnet 5.5 on `google-vertex/global` and Terra 6.1 on `azure`, with fallbacks off. Prompt v8 and the reader are the same for both. Reasoning stays low. The output limit stays 4096. The tool does not select the final or cheapest model.

Both models go through one serial queue, one request at a time. Each photo goes to both models before the next photo.

## Credit preflight

The shared OpenRouter account funds the marking key, so a run can stop with 402 errors while the ledger still has room. Before any ledger access or provider request, the tool reads `GET https://openrouter.ai/api/v1/credits` with the marking key. Remaining is `total_credits - total_usage`. The tool refuses to start when remaining is less than the estimate plus the in-flight need. The in-flight need is the parallel requests (1) times the largest single request's worst case, which is the ledger's reservation bound (USD 4.04 for Sonnet in the saved evidence). So a run with 20 photos needs USD 4.73 remaining.

It prints `Estimate`, `In-flight need` and `Remaining`, and saves them in `credit-preflight.json`. It never prints the key. A failed read refuses too, and prints `Remaining: unknown`. Use a new output folder for the next try.

OpenRouter's reference says this route needs a management key. If the marking key is not one, the read fails and the tool refuses. It does not use a different key.

Saved plan and output ownership checks occur before public preflight or credential access. An exclusive execution marker prevents a second paid execution. After fresh public preflight, a second immutable dispatch plan binds the live evidence and reservation maximum. A changed route policy stops the run. A verified price refresh for each model uses the existing evaluation RPC. Each admission saves the authoritative liability response. Each HTTP attempt saves its raw envelope before settlement.

The runner dispatches serially. A clean 429 requires status and error code 429 with no generation, usage, or choices. It retains the hold and defers that pair. It waits at least 15 minutes. It permits one delayed retry. A second 429 stops the remaining work. An unknown outcome stops dispatch. Response, journal, and settlement failures stop dispatch. Existing holds remain for reconciliation. Known settled costs are not refunded. The tool cannot resume paid work after an exit or failure. Root must inspect the saved ledger and journal before any separate action.

## Report and checks

`report.json` gives the item counts (photos, item labels, AI-marked, parent) and refused and incomplete inputs. Under `models`, it gives each model's definite-mark denominator, wrong definite marks, wrong-as-right count, clear unsure count and reasons, two-ways results, schema failures, provider usage, token counts, measured cost per page, retained holds, and p50 and p95 latency. `disagreements` lists every photo and item where the models differ, with the human truth. The command prints the same result as a side-by-side table. The report keeps D267 at at most 1 percent wrong definite marks, zero wrong-as-right, and at most 5 percent unsure on clear photos, for each model. Missing or refused inputs cannot pass.

Proof classes remain separate: local estimate, local fake, physical input preparation, physical/provider results, and saved reader replay. Actual phone-photo and handwriting recognition remain unproven until the completed human photos arrive and root runs the approved evaluation. Provider privacy and family release remain outside this tool.

Focused local checks:

```sh
npx vitest run src/lib/scan-marking-physical.test.ts src/lib/scan-marking-comparison.test.ts --maxWorkers=1
npx eslint scripts/scan-marking-physical-cli.ts src/lib/scan-marking-physical.ts src/lib/scan-marking-physical.test.ts
```

Root can run the new SQL probe in a new empty disposable local database after the serial heavy window is free:

```sh
SCAN_MARKING_SOCKET=/tmp/pd542-pg-PHYSICAL \
SCAN_MARKING_DATABASE=pd542_physical_review \
node supabase/tests/scan_marking_physical_evaluation.cjs --bootstrap
```

The two-model change did not run this SQL probe, Chromium, a PDF render, a browser, a credits read or paid inference. It proved the tool with fake HTTP and saved replay on the real kit.
