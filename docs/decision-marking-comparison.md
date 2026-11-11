# Decision second-opinion comparison

This local tool compares two decision models as a second opinion on each marked answer (#851, spec #850 slice A): `typesafe/jev-1.14` and `google/gemini-decision-1`. It uses the fixed 40 synthetic photos of the made-up Robin booklet. It sends no real child data and writes nothing to the database. It does not change marking.

## The decision client

- `src/lib/decision-client.ts`: the interface. `decide({ input, questions, signal })` gives one typed answer for each question: `noul` (yes or no: the probability of yes and a confidence), `choice` and `score`. A failure is a `DecisionError` with a kind: `refused`, `blocked`, `timeout`, `malformed` or `unavailable`.
- `src/lib/decision-openrouter.ts`: the adapter for `POST https://openrouter.ai/api/alpha/decisions`. It pins each model to one provider with no fallbacks. It reads the cost from `usage.cost` in the HTTP answer. The cost of a request is the sum of all its attempts, a charged failed attempt included. If an attempt gives no cost, the result keeps the known sum and is marked `costKnown: false`.
- `DECISION_MODELS` in `src/lib/decision-client.ts` is the pinned model table: the provider, the prompt and completion prices, the context length and the most output tokens of each model, read from OpenRouter on 2026-11-11. Jev is on `typesafe` (USD 0.042 per million input tokens) and Gemini Decision 1 is on `google-ai-studio` (USD 0.10 per million). Both have a context of 262,144 tokens and no output price. The client refuses a model that is not in the table. Change a row only after you read the endpoint again.
- `src/lib/decision-client-fake.ts`: a fake that answers from a script, for tests.
- The client is on only when `DECISIONS_OPENROUTER_API_KEY` is set. `DECISION_MODEL` sets the model (default `typesafe/jev-1.14`). No decision code reads `OPENROUTER_API_KEY` or `SCAN_MARKING_OPENROUTER_API_KEY`.

## What the comparison asks

For each item, the tool takes the scored regions from `markingRegions` and keeps only the items that `cropPlan` can crop. It asks one yes/no question for each scored region, on a crop of that region:

- A number, fraction or word box: "Does this box show <forms>?". The forms are the key and every other accepted form, joined with " or ", with the unit when the item prints one.
- A choice: "Is option <key> the one circled (or ticked)?".
- Yes means that the box holds exactly that answer. No means anything else: a blank box, a different answer, a crossed-out answer, two answers, or writing that cannot be read.

The tool never shows the model a known wrong answer. An item is confirmed at a threshold only when each of its scored regions has P(yes) at or above that threshold. An error, refusal, block or time-out is never a pass: that item is not confirmed at any threshold. The adapter refuses a choice or score answer that does not give a probability from 0 to 1 for each option or level, and a yes/no answer without a probability from 0 to 1, as `malformed`. It never fills in a missing value.

The truth groups are:

- `right` rows count toward the confirm rate.
- `wrong`, `blank` and `uncertain` rows count toward false Right. If one of these rows is confirmed, it is a false Right.
- `parent` rows (the 4 two-ways items) are listed and left out.

Each crop is the region's printed box plus a 15% margin. The tool scales it to Jev's image limits: each side 280 to 1,568 px, and at least 78,400 px in total. A white margin fills a short side that is too short. The Multimodal Decisions guide gives 256 px as the minimum side, but on 2026-11-11 Jev refused every image with a side below 280 px ("Invalid image dimensions"). The synthetic photos are drawn on the page image, so page pixels are photo pixels. The tool refuses a photo whose size is not the page size. Real phone photos need calibration first (slice B).

## How to run it

The set folder is read only. The output goes to `.workbook-sample/decision-comparison/` (gitignored).

```bash
SET=/Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/comparison/robin-fixed40

# 1. The cost estimate. No key is read and nothing is sent.
node scripts/decision-marking-comparison.mjs --set "$SET" --estimate

# 2. A fake HTTP run: the real adapter with a fake fetch. No key. The report is marked fake.
node scripts/decision-marking-comparison.mjs --set "$SET" --fake-http --save-crops

# 3. The real run. The key is in the macOS Keychain. Give it only to this one command.
DECISIONS_OPENROUTER_API_KEY="$(security find-generic-password -s decisions-openrouter-unica -w)" \
  node scripts/decision-marking-comparison.mjs --set "$SET" --max-usd 2
```

`--max-usd` (default 2) is the cost cap of the run, for both models together. If the estimate is above the cap, the run does not start. Each request reserves the most it can cost: the model's whole context at its pinned prompt price (plus its most output tokens at its completion price, when that price is above 0), times the most attempts of one request. For Jev with one retry, this is 2 x 262,144 x USD 0.042 per million = USD 0.0220. For Gemini Decision 1, it is USD 0.0524. The tool sends a request only when the money spent, plus the reservations of the requests in flight, plus this reservation, is at most the cap. So no request can take the spend past the cap. When a request ends, its known cost replaces its reservation. Each attempt that gave no cost counts at its whole bound, and the report counts that request under missing cost. If a cost is above its bound (the pinned prices are out of date), the tool sends no new request, and the report says that the run stopped at the cost cap. A request that is not sent is recorded as `budget`, which is not confirmed. The estimate assumes one retry for each request, so a real run costs less. `--models` runs only the models you name. `--save-crops` writes each crop as it is sent, so you can check the crops by eye.

## The report

`report.md` and `report.json` give the following for each model:

- The summary table: the lowest threshold with 0 false Right, the confirm rate at that threshold, whether the pass bar is met, the cost, the cost per photo, and the p50 and p95 latency.
- False Right and the confirm rate at each threshold from 0.50 to 0.99 in steps of 0.01, with false Right split into wrong, blank and uncertain.
- A reliability table: items by P(yes) in bands of 0.1, against the share of those items that are right.
- The errors by kind and the providers that answered.

The pass bar is 0 false Right and at least 80% of right items confirmed at the same threshold. A request with no answer (an error, or not sent under the cap) is not confirmed. If a wrong, blank or uncertain row has a request with no answer, the threshold table counts only the answered rows, so its 0 false Right is not proven: the model does not pass, and the report says "incomplete: <n> non-right requests failed". "High confidence" means P(yes) at or above the lowest 0-false-Right threshold. Synthetic ink does not prove real handwriting. Production use also needs the bar on real phone photos (slice B) and decision #849.

Each `results-<model>.json` file keeps each request's P(yes), error kind and message, latency, cost and provider. Latency is measured on this Mac, from the start to the end of each request, retries included.
