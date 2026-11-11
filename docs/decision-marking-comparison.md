# Decision second-opinion comparison

This local tool compares two decision models as a second opinion on each marked answer (#851, spec #850 slice A): `typesafe/jev-1.14` and `google/gemini-decision-1`. It uses the fixed 40 synthetic photos of the made-up Robin booklet. It sends no real child data and writes nothing to the database. It does not change marking.

## The decision client

- `src/lib/decision-client.ts`: the interface. `decide({ input, questions, signal })` gives one typed answer for each question: `noul` (yes or no: the probability of yes and a confidence), `choice` and `score`. A failure is a `DecisionError` with a kind: `refused`, `blocked`, `timeout`, `malformed` or `unavailable`.
- `src/lib/decision-openrouter.ts`: the adapter for `POST https://openrouter.ai/api/alpha/decisions`. It pins each model to one provider with no fallbacks (`DECISION_PROVIDERS`: Jev on `typesafe`, Gemini Decision 1 on `google-ai-studio`). It reads the cost from `usage.cost` in the HTTP answer.
- `src/lib/decision-client-fake.ts`: a fake that answers from a script, for tests.
- The client is on only when `DECISIONS_OPENROUTER_API_KEY` is set. `DECISION_MODEL` sets the model (default `typesafe/jev-1.14`). No decision code reads `OPENROUTER_API_KEY` or `SCAN_MARKING_OPENROUTER_API_KEY`.

## What the comparison asks

For each item, the tool takes the scored regions from `markingRegions` and keeps only the items that `cropPlan` can crop. It asks one yes/no question for each scored region, on a crop of that region:

- A number, fraction or word box: "Does this box show <forms>?". The forms are the key and every other accepted form, joined with " or ", with the unit when the item prints one.
- A choice: "Is option <key> the one circled (or ticked)?".
- Yes means that the box holds exactly that answer. No means anything else: a blank box, a different answer, a crossed-out answer, two answers, or writing that cannot be read.

The tool never shows the model a known wrong answer. An item is confirmed at a threshold only when each of its scored regions has P(yes) at or above that threshold. An error, refusal, block or time-out is never a pass: that item is not confirmed at any threshold.

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

`--max-usd` (default 2) caps the run. If the estimate is above the cap, the run does not start. During the run, the tool does not send a request when the money spent plus the request's estimate would go above the cap. It records that request as `budget`, which is not confirmed. The estimate assumes one retry for each request, so a real run costs less. `--models` runs only the models you name. `--save-crops` writes each crop as it is sent, so you can check the crops by eye.

## The report

`report.md` and `report.json` give the following for each model:

- The summary table: the lowest threshold with 0 false Right, the confirm rate at that threshold, whether the pass bar is met, the cost, the cost per photo, and the p50 and p95 latency.
- False Right and the confirm rate at each threshold from 0.50 to 0.99 in steps of 0.01, with false Right split into wrong, blank and uncertain.
- A reliability table: items by P(yes) in bands of 0.1, against the share of those items that are right.
- The errors by kind and the providers that answered.

The pass bar is 0 false Right and at least 80% of right items confirmed at the same threshold. "High confidence" means P(yes) at or above the lowest 0-false-Right threshold. Synthetic ink does not prove real handwriting. Production use also needs the bar on real phone photos (slice B) and decision #849.

Each `results-<model>.json` file keeps each request's P(yes), error kind and message, latency, cost and provider. Latency is measured on this Mac, from the start to the end of each request, retries included.
