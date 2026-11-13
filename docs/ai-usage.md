# AI usage and cost (D-330)

The team sees every AI call and its cost on `/admin/ai`: total cost, calls, cost by feature and by model, and one line for each family. OpenRouter's activity page is the deep dive.

## The ledger

`public.ai_usage_events` holds one row for each AI call that came back with usage: time, feature, provider (`openrouter`, `anthropic` or `subscription`), model, input and output tokens, cost in US dollars (null when the provider gave none), OpenRouter's generation id, `parent_id` and `child_id` when the caller knows them, and `source_kind` with `source_id` (a workbook run, a Maya call, a scan photo, an assessment).

- Append only. A trigger refuses an update.
- Written by the server only, with the secret key. Admins read. Parents read nothing.
- Deleted with the family and with the child (foreign keys with `on delete cascade`). The family write fence and the child delete fence cover new rows.
- A call with no family has a null `parent_id`: team tools, sample runs, and any call whose caller did not know the family.
- Features: `workbook`, `solve_check`, `workbook_gate`, `maya`, `maya_review`, `maya_note`, `maya_speech` (an estimate, older ledger only), `child_profile`, `learner_profile`, `report`, `work_review`, `marking`, `explain`, `photo_check`, `other`. The list in `src/lib/ai-usage.ts` equals the check on the column (`src/lib/state-lists.test.ts`).

## Writing

`recordAiUsage(tag, reading)` in `src/lib/ai-usage.ts`. It never throws and never waits: it starts the insert (5 s limit) and returns. A failed write logs one line with no data. No child name, prompt or answer goes in: ids only.

Where readings come from:

| Adapter | Reads | Cost |
|---|---|---|
| OpenRouter (`src/lib/ai-openrouter.ts`, `onUsage`) | `usage.prompt_tokens`, `usage.completion_tokens`, `usage.cost`, the response `id`. Every request now sends `usage: { include: true }`. | USD from OpenRouter |
| `claude -p` (`src/lib/ai-claude-cli.ts`, `onUsage`) | the envelope's `usage` (cache reads and writes count as input) | none: "subscription, no per-call charge" |
| Decision client (`src/lib/decision-client.ts`) | the `usd` and `id` it already computes for each request, a charged failed request included | USD |

The caller gives the tag: `aiClient(env, model, { usage: { feature, parentId, childId, source } })`. A call with no tag is stored as feature `other`. Callers that do not know the family (the child profile rebuild outside a Maya call, the learner profile outside the report job) store no family: those rows count as team cost even with test families left out. Model comparison runs (`scan-marking-comparison-run.ts`) are stored as feature `other`, not `marking`. The workbook worker on the Mac gets its key from the Keychain, so it passes it with `configureAiUsage` and flushes the writes after each job. Not recorded: the Codex sample client, a `claude -p` call that failed and used nothing, the local tools on the Anthropic API key (`maya:text`, `maya:practice`, the sample scripts' direct clients), and Maya's speech and voice (estimates in `maya_spend`). Work done in a Vercel request is started before the answer is sent; a process that stops at once can lose the last write.

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

- Period pills: 7 days, 30 days (default), this month. Days are Vancouver days (`PACIFIC_ZONE`, `src/lib/family-time.ts`), not a family's. The page sends the start of each day to the function (`p_day_starts`), so the daily chart uses the same day rules as the period.
- Tiles: total cost in USD with CAD at `MAYA_USD_TO_CAD` (default 1.40), AI calls, subscription calls.
- OpenRouter against our ledger, for this month: "OpenRouter says" (the sum of `GET /api/v1/key` `data.usage_monthly` for each distinct server key: the main key and the keys of marking, explanations and decisions), "We recorded" (test families included, because OpenRouter bills them too) and "Not recorded". One request for each key, once for each page load, server side, 5 s limit. No key set: the card says so. No key answers: "OpenRouter did not answer." Some keys answer: the card says the number is partial. OpenRouter counts the calendar month in UTC.
- Cost by day, stacked by model: the six models with the most cost get fixed colours in cost order, the rest are grey "Other models". Subscription calls add no cost. A table view sits under the chart.
- Cost by feature (groups in `FEATURE_GROUPS`) and cost by model (top 8, then one line for the rest).
- Families by AI cost, largest first, with the family's plan price per month (CAD, from `child_plan_states`: paying, or ending until its end date; a free month shows "free month") and the AI cost as a percent of that price for the same number of days (a month counts as 30.44 days; both in CAD). One line, "No family", holds team tools, tests, sample runs and history without a family.
- The sidebar's "Show test families" switch decides whether test families count (off by default). The page makes one or two database function calls and no other request; no polling, no prefetch.
