# Robin phone-photo implementation

IMPLEMENT_DONE_ROBIN_PHONE_PROOF

Computer: `Savars-MacBook-Pro-5.local`.

Physical checkout: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-66f57c65`.

Prepared path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-66f57c65`.

Branch: `site/scan-marking-phone-proof`.

Base: `de1512717bd297a891069605cefab88d7ad13a54` (main #696).

The initial checkout was clean on `t3/scan-marking-phone-proof` at `96e845e558aa867a27d355679b6e24871360a944`. The private branch starts at the required base. The final handoff supplies the exact committed head. No other checkout or dependency root was used. This checkout's dependencies were installed with `npm ci --ignore-scripts --no-audit --no-fund`.

## Files and behavior

- `scripts/scan-marking-physical.mjs`: local launcher.
- `scripts/scan-marking-physical-cli.ts`: frozen-kit validation, photo preparation, immutable plans, ledger-backed dispatch, fake HTTP, and saved replay.
- `src/lib/scan-marking-physical.ts`: separate physical format, strict CSV and human-label validation, mapping, and report adapter.
- `src/lib/scan-marking-physical.test.ts`: hostile public-interface checks.
- `supabase/migrations/20261107_scan_marking_physical_evaluation.sql`: additive aggregate-budget admission. It is not applied.
- `supabase/tests/scan_marking_physical_evaluation.cjs`: disposable local SQL probe for root. It is not executed.
- `docs/scan-marking-physical.md`: full operator contract and commands.

Existing production files and fixed40 files are unchanged. The physical tool calls existing public normalization, calibration, sheet, crop, request, strict schema, reader, evaluation transport, and journal interfaces. The physical report adapts the existing D267 scorer without changing its rules or fixed40 validation.

The additive RPC is necessary because the existing USD 15 limit belongs to each run. It does not atomically limit earlier and current tests together. The new physical admission sums all recorded marking charges and retained holds under the existing global lock. It includes production test spend conservatively. It delegates existing price, run, monthly USD 50, lifetime USD 50, and unknown-result admission. It changes no existing function. Root must review, apply, and verify it before paid use.

## Operator commands

Free template:

```sh
node scripts/scan-marking-physical.mjs --template --kit /Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/synthetic-booklet --photos /absolute/robin-phone-photos --out /absolute/new-robin-template
```

Free preparation and estimate:

```sh
node scripts/scan-marking-physical.mjs --estimate --kit /Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/synthetic-booklet --photos /absolute/robin-phone-photos --truth /absolute/completed-human-truth.csv --out /absolute/new-robin-estimate
```

Explicit paid path, for root after its gates and environment setup:

```sh
node scripts/scan-marking-physical.mjs --run --max-usd 15 --kit /Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/synthetic-booklet --photos /absolute/robin-phone-photos --truth /absolute/completed-human-truth.csv --out /absolute/new-robin-paid-run
```

Saved replay, without inference:

```sh
node scripts/scan-marking-physical.mjs --replay /absolute/previous-robin-run --out /absolute/new-robin-replay
```

Use a new or empty output folder. The tool has no paid resume. Old attempts, exits, refunds, unknowns, and copied results do not authorize another execution. The paid run uses Sonnet 5.5, `google-vertex/global`, prompt v7, low reasoning, 4096 output tokens, and fallbacks off. It does not choose a final model.

## Input contract

The photo folder contains originals and `photos.json`. Each entry names the exact file, PDF page, device, and human clarity label. Each of the two devices must cover all 10 exercise pages. All extra controls remain in the input set. Missing or refused inputs prevent a pass.

The extended CSV retains the original nine columns. It adds `photo,item_id,region_id,reading_state,reading_issue,photo_clarity,device`. Each scored region needs an independent human row. The two-ways item has a pending parent row. It is never scored automatically. A complete two-phone series has 152 region rows, 148 item labels, 146 scored items, and two parent items. The template supplies identities only. It leaves human answer and result labels empty. It rejects malformed quoting, duplicate/missing/extra rows, unsafe paths, symlinks, incomplete labels, and inconsistent identities.

The kit's three required hashes were rechecked and match the supplied values. The kit was not changed. Its immutable synthetic evaluation revision is not a published print revision. Its QR tokens remain unregistered.

## Local evidence

The combined focused command passed 136 tests: 22 physical tests and 114 existing comparison controls. The final physical-only run also checks deferred latency. The scoped TypeScript program passed with roots limited to the two new TypeScript modules and their test. Scoped ESLint passed. The SQL probe passed JavaScript syntax checking only.

The checks cover page/region/CSV identity, full truth coverage, explicit clarity, parent pending state, orientation and metadata, wrong QR, missing corners, changed geometry, false-complete refusals, stale output files, changed plans and images, changed dispatch plans, malformed model output, unknown usage, lost response, fatal response/reservation/settlement writes, retained holds, one delayed clean429 retry, aggregate-RPC routing, and saved replay identity.

Local example files are under this checkout's ignored `.workbook-sample/` folder. The final fake report is `robin-phone-committed/report.json`. The final replay report is `robin-phone-committed-replay/report.json`. The example input is `robin-phone-example/`. The free template is `robin-phone-template-proof/human-truth.csv`. The free estimate is `robin-phone-estimate-proof/estimate.json`.

The fake run uses 20 copied existing blank print images. It reports 146 scored items, two parent items, zero refused photos, and zero provider charge. Its proof class is `local-fake`. The replay proof class is `saved-reader-replay`. These results prove local geometry and interpretation only. They do not prove real phone cameras, handwriting, hosted permissions, provider behavior, or D267 recognition acceptance.

- Image checks prove synthetic orientation, QR, corner, and crop behavior. They do not prove phone cameras.
- Truth checks prove strict row and label admission. They do not validate handwriting recognition.
- Run checks prove local ownership, replay, and failure stops. They pass through an in-memory ledger.
- Fixed40 checks preserve the existing local validator, reader, and accounting controls. They do not call a provider.

The budget and journal tests use in-memory ledger seams. They prove that the local runner retains holds and stops dispatch. They do not prove PostgreSQL or hosted atomic admission. Root must execute the supplied disposable SQL probe and verify the hosted RPC before paid use.

No inference, credential retrieval, hosted query or migration, flag change, full suite, build, Chromium run, PDF render, browser action, push, or PR occurred. Root retains review, full gate, publication, SQL application, hosted verification, and the actual physical-photo run.
