# Synthetic marking evidence, 14 November 2026 (prompt v9, production route)

Sonnet 5.5 passes D-267 on the fixed synthetic set with prompt `whole-page-scalar-readings-v9` (PR #925, #921), on both endpoints of the production route of PR #929 (#900, D-337): `anthropic` and `azure/global`. This is new inference, not a replay. It establishes no real-handwriting, phone-camera or real-family release proof. Family release stays behind #542. Neither PR was merged by this work.

## Fixed inputs and reading rule

The photos, frames and truth are the fixed 40 of the v7 acceptance ([v7 report](scan-marking-v7-acceptance-20261107.md)): 40 metadata-free whole-page JPEGs, 30 clear and 10 blurry, of the made-up Robin booklet. The saved manifest file SHA-256 is `c206c70d6ea3b8cb8efcd59691bf90289227c0c3e8955b0ccd9a93bf39627497`, checked before the run. Its frozen synthetic print identity is `1f5d1520b9f08b125d57d81bf292`.

The tool reads that exact file through `upgradeFixed40Manifest`, the same step the physical tool's `--fixed-set` uses: the four old parent rows (two-ways) become blank AI-marked rows, which is what those photos show. Nothing else changes. The upgraded manifest hash in both run plans is `445410b46f35223e7f538c415dbb2c258b6f4bbdc05bbc0fddc2b59b6226a542`. With `TWO_WAYS_METHOD_MARKS` on, no item goes to the team, so all 296 truth rows are AI-marked and the clear denominator is 222, not 219. These photos have no written method, so this set does not test two-ways method marking.

The scorer, truth, denominator rules and D-267 thresholds did not change. D-267 and the unclear-reading refusal were committed at `73460cfe241a8c2578eaba490d1c23d612dd6dbe` (`2026-11-06T21:39:19.000Z`), before these requests.

All requests use the production `runScanMarking` request, strict schema and reader, low reasoning with reasoning text excluded, 4096 output tokens, one attempt, fallbacks off and the endpoint pinned alone. Truth and stored answer keys are not sent to the model.

## Route and code

The production route sends Sonnet to `anthropic` first, then `azure/global`, with Google ignored (`MARKING_CLAUDE_ENDPOINTS`). The comparison tool keys each run by model, so it tests each endpoint as its own pinned pair, in two runs: `--models anthropic/claude-sonnet-5.5@anthropic` and `--models anthropic/claude-sonnet-5.5@azure/global`. A request answered by any other provider fails (`served-provider-model-or-generation-mismatch`).

Code on `site/scan-marking-v9-eval` (source `34c42db3eb3901d28e2f77ec00e647f19d39c794`, on main `5b09bcf9` with `83310ae2` from PR #925 and `3ed521c0` from PR #929 merged in):

- `data/scan-marking-evaluation-models.json` adds Sonnet on `anthropic` (provider `Anthropic`) and on `azure/global` (provider `Azure`). The historical 13 pairs are unchanged, and a plain model id still selects the Vertex pair.
- `selectComparisonModels` takes `model@endpoint` for one exact pair, with at most one pair per model in a run. The selected pairs reach result identity, recovery, reports and dispatch.
- `comparisonManifestFromBytes` upgrades only the exact fixed-40 v7 bytes. Any other manifest is read as it is, so a manifest with parent rows is still refused.
- `data/scan-marking-route-evidence-20261114.json` keeps the public endpoint snapshot used.

Focused tests: 188 passed in `src/lib/scan-marking-comparison.test.ts` and `src/lib/scan-marking-physical.test.ts`. `tsc --noEmit` and ESLint on the changed files pass.

## Results

| Endpoint | D-267 | Wrong / definite | Wrong marked right | Clear unsure / 222 | Unsure, all | Schema failures | Served by | USD/page | Latency p50/p95 |
|---|---|---:|---:|---:|---:|---:|---|---:|---|
| Sonnet 5.5, `anthropic` | PASS | 0/222 | 0 | 0 | 74 | 0 | Anthropic, 40 of 40 | 0.0134847 | 3982/4874 ms |
| Sonnet 5.5, `azure/global` | PASS | 0/222 | 0 | 0 | 74 | 0 | Azure, 40 of 40 | 0.0134842 | 3017/3908 ms |

Against the bar, for each endpoint:

- At most 1% wrong definite marks: 0 of 222 (0%). Pass.
- Zero wrong answers marked right: 0. Pass.
- At most 5% unsure on clear photos: 0 of 222 (0%). Pass.

All 74 unsure items are on the 10 blurry photos, each with the issue `blurry`: the 73 unclear truth rows plus the blank two-ways item on the blurry page. No unclear row got a definite mark. Every request returned schema-valid output, with known cost and tokens, no retry and no 429. v7 had one clear `answer-form` unsure out of 219; v9 has none out of 222.

Tokens per endpoint: 196,488 input, about 14,640 output, 0 reasoning. The 84-page cost at this rate is USD 1.13, an extrapolation from these photos, not a measured bill.

## Run identity and cost

| Run | Endpoint | Run hash | First reservation | Last settlement |
|---|---|---|---|---|
| 1 | `anthropic` | `dde81bc7bdcb5c85abd7096e7442c508bd75bd0bc89b94f716cfbf50a67575df` | 2026-11-14T01:43:31.998Z | 2026-11-14T01:46:25.226Z |
| 2 | `azure/global` | `f345734b3963f58b3757d465f8f3d61ec3b2449ba40d1f716d8be552dd0ddc0a` | 2026-11-14T01:46:54.136Z | 2026-11-14T01:49:07.834Z |

- Provider cost: USD 0.539386 (`anthropic`) plus USD 0.539366 (`azure/global`), USD 1.078752 in total. The ledger rounds each attempt up to a whole microdollar: 539,388 plus 539,368, 1,078,756 microdollars. All 80 attempts settled; neither run left a hold.
- The marking key's usage rose from USD 0.130065472 to USD 1.208817472, exactly USD 1.078752. This key's provider limit is USD 5 total with no reset (`limit_reset: null`), which was the hard stop. Cedric approved up to USD 5 (2026-11-13); the spend is under the USD 4.50 run ceiling.
- Each run had `--max-usd 5`. The ledger reserves the full context bound, USD 4.04096 a request, before each call. Actual spend could not pass the key's limit.
- The planning estimate was about USD 0.92 an endpoint (4,000 input and 1,500 output tokens a page at base price). The measured cost was USD 0.54 an endpoint.
- Raw transport envelopes, journals, results, plans and reports are under `~/unica-workbook-samples/first-customer-marking-20261106/comparison/v9-route-runs/<run hash>/` on Cedric's Mac. The snapshot folder is `comparison/v9-route-snapshots-20261114/`.

## Price evidence inserted

Savar authorized (through the coordinator, 2026-11-14) the first enabled `scan_marking_evaluation_prices` rows for Sonnet on these two endpoints. Each evidence text is the compact `JSON.stringify(EndpointEvidence)` that the tool's `--estimate` printed for a public snapshot taken at 2026-11-14T01:27:46Z. Each maximum is the tool's `reserveMaximum`: 1,000,000 context tokens at the highest input rate (USD 4 per million, the 1-hour cache write) plus 4,096 output tokens at USD 10 per million. This is the same calculation and pixel limit as the Vertex row. Applied through the Supabase Management API at 2026-11-14T01:43:14Z, in one transaction:

```sql
insert into public.scan_marking_evaluation_prices(model,endpoint,evidence_hash,maximum_micros,max_pixels,evidence,verified_at,enabled)
values ('anthropic/claude-sonnet-5.5','anthropic','97376eaca18bec64156d150232d5538c08392ff6ca9cda5f004ae83072c8df77',4040960,2103750,$ev$<evidence text, 1,658 characters>$ev$,clock_timestamp(),true);
insert into public.scan_marking_evaluation_prices(model,endpoint,evidence_hash,maximum_micros,max_pixels,evidence,verified_at,enabled)
values ('anthropic/claude-sonnet-5.5','azure/global','c720f8a4596b9749c68c0a97f73a78b6c03fd53100b410eaef319b6ab09c1af4',4040960,2103750,$ev$<evidence text, 1,520 characters>$ev$,clock_timestamp(),true);
```

A probe confirmed that both rows are enabled and that `sha256(evidence)` equals `evidence_hash`. Nothing else was inserted by hand. At each run's start, the existing service function `refresh_scan_marking_evaluation_price` added one refreshed row for the live snapshot (same policy and bound; public uptime fields changed): `b7a148b6d523b949aba79c5d4552afab6a7564cf0d1c056ce70bdf0937e8ccab` (`anthropic`, 01:43:31Z) and `6e0a9bab0fcdfa173dcab70658aebe96521d07ec6bdb6c58b04b0a039bccd2aa` (`azure/global`, 01:46:54Z). No migration was made and no production price changed.

## Hosting policy

On 2026-11-14 OpenRouter's ZDR list has no Sonnet row for `anthropic` or `azure/global`. Its Sonnet rows are on Google Vertex and Amazon Bedrock only. Both endpoints are reported as `not-zdr`, and requests carried no `zdr` flag. This is the advertised classification, not a legal statement. It belongs to Savar's provider-policy choice, which stays **deferred** (D-293). No real child photo may be sent before that choice.

## Limits

- These are synthetic digital photos of a made-up booklet, with code-drawn ink. Real handwriting, a filled printed booklet and iPhone/Android camera capture remain unproved.
- The two-ways rows here are blank, so written two-ways methods are not tested. The Robin phone photos test them.
- Each endpoint was pinned alone. The ordered failover from `anthropic` to `azure/global` was not exercised.
- The key used has a USD 5 total limit. The launch record's `dedicated-key-limit` item cites a USD 50 total key; that item needs fresh verification against the key production will load.
- Physical iPhone/Android, sample and screen acceptance, provider privacy, privacy text and release flags stay pending or deferred. No real-family marking, email, charge, plan start or print approval is made here.

## Proposed launch-record change (not applied)

`SCAN_MARKING_LAUNCH_EVIDENCE` is unchanged. Once PRs #925 and #929 merge, the proposed change in `src/lib/scan-marking-launch.ts` is:

- `sonnetTestCandidate.prompt`: `whole-page-scalar-readings-v7` becomes `whole-page-scalar-readings-v9`. The model, `photoSetSha256` (`c206c70d…`) and `printedRevision` stay the same.
- `evaluation-bar`: keep `recordedAt: "2026-11-06T21:39:19.000Z"` and the D-267 text, bound to the new candidate.
- `evaluation-pass`: `recordedAt` at or after `2026-11-14T01:49:07.834Z`. The proof cites this report: new inference, 40 digital photos, 296 AI-marked items, 0/222 wrong definite, 0 wrong marked right, 0/222 clear unsure on both `anthropic` and `azure/global`, with real handwriting unproved.
- `evaluation`: `startedAt: "2026-11-14T01:43:31.998Z"`, `completedAt: "2026-11-14T01:49:07.834Z"`, `definite: 222`, `wrongDefinite: 0`, `wrongAsRight: 0`, `clear: 222`, `clearUnsure: 0`, `plainUnsureReasons: true`. Thresholds stay unchanged.
- `dedicated-key-limit`: the new candidate makes its proof stale. Record it again only after its key limit is checked again (see Limits).
