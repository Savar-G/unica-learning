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

The caller gives the tag: `aiClient(env, model, { usage: { feature, parentId, childId, source } })`. A call with no tag is stored as feature `other`. Not recorded: the Codex sample client, the local tools on the Anthropic API key (`maya:text`, `maya:practice`, the sample scripts' direct clients), and Maya's speech and voice (estimates in `maya_spend`). Work done in a Vercel request is started before the answer is sent; a process that stops at once can lose the last write.

Maya's spending cap is not changed: `maya_spend` still decides the stop. Marking's and the explanations' spend rows are not changed either. The new ledger only reads the answer's usage.

## Reading

`admin_ai_usage(p_from, p_to, p_with_tests, p_cad_per_usd)` (admins only) returns totals, a daily cost by model (Vancouver days), cost by feature, cost by model and up to 200 family lines, each with the family's monthly plan price from `child_plan_states` (paying, and ending until its end date; a free month counts as no revenue). Test families and admin families are left out unless `p_with_tests`; calls with no family stay in.

It also adds the cost older ledgers hold, so the page has history. For one call the new ledger wins:

| Older ledger | Rule |
|---|---|
| `workbook_run_ai_calls` (writer calls and solve checks; `workbook_run_solves` repeats the same checks and is not read) | a run with any new row of the same feature skips its older rows |
| `maya_spend` (CAD micros, turned to USD by `MAYA_USD_TO_CAD`; no model name) | a Maya call with any new row skips its older rows; speech and voice always count |
| `scan_marking_spend`, `parent_explanation_spend` | no family on these rows. They count only before the first new row of that feature, and show as team totals |

Rows with no model name show as "not recorded".
