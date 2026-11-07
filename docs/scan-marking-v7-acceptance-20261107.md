# Synthetic marking evidence, 7 November 2026

Sonnet 5.5 and Terra 6.1 pass D-267 on the fixed synthetic set. Gemini 3.8 Flash fails. This establishes no real-handwriting or real-family release proof. Savar authorized Sonnet on Vertex for the overnight test-family path. The final model and provider-policy choice remain his morning decision.

## Fixed inputs and reading rule

All comparisons use the same 40 metadata-free whole-page JPEGs, 30 clear photos, 296 truth rows, 292 automatic rows, 219 clear automatic rows and four parent-method rows. The nine format groups are whole numbers, fractions, decimals, tick and number, circle, show-work final answers, spot error, words and parent-only two-ways.

The manifest file SHA-256 is `c206c70d6ea3b8cb8efcd59691bf90289227c0c3e8955b0ccd9a93bf39627497`. Its frozen synthetic print identity is `1f5d1520b9f08b125d57d81bf292`. This is the made-up Robin booklet, not a published customer workbook.

The prompt is `whole-page-scalar-readings-v7`. It permits blank only when the answer area is plainly empty and readable. Blur, darkness, shadow, missing areas and covered answers need unsure with a plain reason. There is no local image-quality guard because the current inputs do not provide a reliable area-readability signal.

The fixed reader accepts schema-valid `state: "blank"` with null or empty text and no issue. It stores canonical empty text. Nonempty text, an issue or malformed null input does not become blank. Its file SHA-256 is `1871bf66dfe711a14078d3f5c5905076c3dede39652a99ccf833fd4f97dd7e0f`. The schema, scorer, truth, denominator rules and D-267 thresholds did not change.

All requests use low reasoning with reasoning text excluded, 4096 output tokens, the pinned host and fallbacks off. Truth and stored answer keys are not sent to the model.

## Results

Sonnet is an **offline replay of saved v7 responses, not new inference**. Terra and Gemini are **new inference**. Costs below come from the saved raw provider usage. Ledger costs round each attempt up to a whole microdollar.

| Model and host | D-267 | Wrong / definite | Wrong marked right | Clear unsure / 219 | Clear unsure reasons | Schema failures | USD/page | USD/84 pages | Latency p50/p95 |
|---|---|---:|---:|---:|---|---:|---:|---:|---|
| Sonnet 5.5, Vertex `google-vertex/global` | PASS, saved-v7 offline replay | 0/218 | 0 | 1 | answer-form: 1 | 0 | 0.010951650 | 0.919938600 | 2551/3164 ms |
| Terra 6.1, Azure `azure` | PASS, new inference | 0/218 | 0 | 1 | answer-form: 1 | 0 | 0.005076625 | 0.426436500 | 2270/3264 ms |
| Gemini 3.8 Flash, Vertex `google-vertex/global` | FAIL, new inference | 34/250 | 0 | 3 | answer-form: 1; unreadable: 2 | 0 | 0.002655525 | 0.223064100 | 3846/8072 ms |

The 84-page values are extrapolations from these photos. They are not measured bills for the first customer's book. Sonnet costs and latency come from its original inference. The free replay added no provider charge or new timing measurement.

Terra matched Sonnet's error and clear-unsure counts at about 54% lower measured inference cost. This does not prove equal recognition on real handwriting. All 34 Gemini wrong marks were unclear truth rows read as blank. These definite marks violate the unsure rule even though Gemini marked no wrong answer right.

Sonnet and Terra kept all 73 unclear truth rows unsure. Parent-method rows were excluded from automatic scoring. An unsure result receives no right/wrong mark. The remaining `answer-form` case is visible in the row report; it was not removed.

## Provenance and cost reconciliation

- D-267 thresholds and the unclear-reading refusal are in source commit `73460cfe241a8c2578eaba490d1c23d612dd6dbe`, committed at `2026-11-06T21:39:19.000Z`, before these requests. This is a source-record timestamp, not a new human approval.
- Sonnet's saved inference run is `49952bcc31e3ca7ab1d7c3eb3396b77cd2a5a4c66490694385565971770b4e04`, source `ec394b30a6bae0c077cbfbd20e5952154678284b`, from `2026-11-07T04:37:20.105756Z` to `04:40:57.774391Z`.
- The fixed-reader replay artifact was saved at `2026-11-07T05:10:56.632Z`. Reader commit `e4bf41eea44458d42229f3db20b3c54f715299ee` and the replay passed independent Sol review. It checked 281 focused tests, 7,008 hostile input cases, the expected eight prior-reader failures and 204 unchanged input hashes.
- The original Sonnet/Haiku report remains alongside that replay. Haiku fails the replay with 17/227 wrong marks, including eight clear written-right answers read as blank and nine unclear answers read as blank. It is not an accepted substitute.
- Terra/Gemini run `7cdf61d608c83be12c66ee6118a492c460ca76b7b204e12a65e9a20202a2f2fe` used exact source `e678194e15f1bbf4b4bab94cd3e4a68621251670`. It ran from `2026-11-07T07:12:38.519493Z` to `07:18:00.615340Z`. Both endpoints passed the live preflight at `07:12:38.897Z`.
- All 80 requests completed. Each model has 40 results and 40 settled ledger attempts. There were no retries, deferrals, schema failures or unknown costs in this run.
- Terra cost USD 0.203065 at the provider and 203,082 microdollars in the ledger. Gemini cost USD 0.106221 and 106,240 ledger microdollars. The run totals are USD 0.309286 and 309,322 ledger microdollars.
- Dedicated key usage increased exactly from USD 1.324855503 to USD 1.634141503. Its outside limit remains USD 50 total, with `limit_reset: null`. No secret is recorded here.
- Total ledger charges after the run are 1,781,399 microdollars. Retained earlier holds are 297,416. Their total liability is USD 2.078815 under the aggregate USD 15 stop. No old hold was released. The new immutable run was admitted with only the remaining USD 13.230507 after earlier liability.

The raw files and row reports are retained under `/Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/comparison/`. The accepted replay is in `blank-reading-repair/offline-replay-null-reader/e4bf41eea44458d42229f3db20b3c54f715299ee/`. The new report and 584 new-inference rows are in `terra-gemini-v7/final-report/`. Original reports and raw responses remain unchanged.

## Hosting policy

The exact live records list Azure/Terra and Vertex/Sonnet for zero data retention. Vertex/Gemini has **Safety Retention, not strict zero retention**. These are the advertised endpoint classifications, not legal guarantees. The actual transport provider was Azure for every Terra request and Google for every Gemini request.

Sources: [Terra endpoints](https://openrouter.ai/api/v1/models/openai/gpt-6.1-terra/endpoints), [Gemini endpoints](https://openrouter.ai/api/v1/models/google/gemini-3.8-flash/endpoints), [Sonnet endpoints](https://openrouter.ai/api/v1/models/anthropic/claude-sonnet-5.5/endpoints), [ZDR endpoint list](https://openrouter.ai/api/v1/endpoints/zdr).

Provider privacy and the privacy route remain **deferred by Savar**. No real child photo may be sent before his host-policy choice. MiMo and Qwen remain not fully tested. No additional model comparison is authorized by this report.

## Code and hosted proof

The exact inference source `e678194e` passed 17,450 tests in 489 files, with one optional skip, full ESLint and a normal production build. Its independent Sol R2 review passed 180 focused tests, 17 public controls and 37 fake launcher controls. The matrix produced 80 fake requests; prior-source controls reproduced all four incomplete-Terra paths.

The reader's eight-format prior-source test fails on the old null-blank reader. The shared v7 prompt's prior-source controls also fail. Those are binding code controls. They do not establish real camera recognition.

The local first-customer round9 contract was checked again through the public fixed reader. It has 84 pages and 582 questions: 388 write-number, 86 circle, 60 show-work, 19 spot-error, 16 tick-and-number, seven two-ways and six write-words. The 388 write-number items split into 386 whole-number and two decimal readings. This exact revision has no fraction answer; the earlier approval sample did, and fractions remain in the fixed synthetic benchmark. All 575 code items accept supplied stored-key readings and null blanks, and keep supplied blurry readings unsure. All seven parent-method items remain pending and ineligible for automatic mastery. No item lacks a route.

The repeatable offline command is:

```sh
node scripts/scan-marking-book-coverage.mjs /absolute/candidate-rendered-contract.json bfc5542e32bb062b88bbd26b4c4326e983b5c2708d543460e8179894e6f055fc
```

Use the actual new contract hash after a revision. The checker never reads images, renders, calls a model, accesses a database or reads a credential. It rejects a changed hash and missing measured contracts. A removed answer region produces a gap and exit 1. The prior null-blank reader produces 575 failed blank checks and exit 1 on this same input; the repaired reader passes all 575. The result is supplied-reading route proof, not independent answer-key validation, recognition, a saved customer R2 or print approval. The command reports unsupported future formats instead of adding them automatically.

Hosted evaluation-price rollback probes accepted both correct conservative bounds and refused two understated bounds and two increased cache-read liabilities. All probe changes rolled back. Reviewed evaluation-only prices were then enabled. Production prices remained disabled. The test-family production price, key-loading, deployed source and positive parent proofs remain separate work.

The evaluated full-reservation resolution migration is additive and was already applied as `20261107040916`. The earlier MiMo HTTP 200 body timeout was audited and permanently charged at its full 147,948-microdollar reservation. It received no fabricated tokens or generation ID. Production unknown-cost admission was not changed.

## Test-family path and remaining holds

Savar authorized the temporary Sonnet test-family path overnight. `SCAN_MARKING_MODEL` is the one runtime model setting. Its pinned provider comes from the reviewed model map. An environment-only Terra selection remains refused; the tested evaluation option does not enable a production model.

Root will use `SCAN_MARKING_ENABLED=test-only` with `SCAN_MARKING_TEST_PARENT_IDS` containing only its owned synthetic fixture parents, after the applicable production checks. Listed parents must still have a current test/Admin database mark. An absent list preserves the historical test-only rule; a malformed present list refuses access. No setting is applied by this code or record.

To stop marking, remove `SCAN_MARKING_ENABLED` and redeploy. Do not remove only the parent list: that restores access for all currently marked test/Admin families when test-only remains enabled.

The canonical launch record now records the synthetic Sonnet result, the unchanged bar and verified limits. `familyReady` stays false. Physical iPhone/Android recognition, applicable shared sample/screen acceptance, provider privacy and family release remain pending or deferred. Preserve recorded S1/S5 approvals and proof. Do not demand a duplicate approval because of a stale manifest label. Keep #542/#458 open for their remaining shared acceptance. No real-family marking, real-parent email, Stripe charge, plan start, customer revision or print approval is made here.
