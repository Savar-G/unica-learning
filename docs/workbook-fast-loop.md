# Workbook generator work

Use this loop for every generator round. Keep sample runs local. Use fake AI or the Claude subscription. Do not write live family rows or call a paid API.

## 1. Check each change

Run only the test files that the change affects. Run the fake sample with the real fit check:

```sh
npm run workbook:fast -- --levels U16 --out /tmp/ui-review/round-inner-u16
```

The short command sets `--fake --no-store --check-only --levels U4,U16 --days 1,5,10 --concurrency 3`. Supply `--levels` again to select the affected levels. Supply `--days` again to select different days. Omit the short command and use the sample CLI without `--days` when the change requires all ten days.

```sh
npx vitest run src/lib/workbook-sample-tools.test.ts
```

For personalization work, `--persona` makes one first book from a made-up profile (`src/lib/workbook-sample-profiles.ts`): `first-customer`, `ahead`, `catch-up`, `on-level` or `rushed`. It needs `--no-store`. Without `--levels`, the book is placed and planned as the workbook job does (production placement). With one `--levels` level, it is a probe: that level's sample input with the persona's standards and book signals.

```sh
node scripts/workbook-samples.mjs --fake --no-store --check-only --persona first-customer --out /tmp/ui-review/first-customer-full
```

Check-only runs the planner, item writer, solve checks, book check and strict page fit checks. It prints the quality line and all failures. It writes the draft, AI cache, solve log, text dump, page manifest, profile and index. It makes no full-book PDF, review print, page image files or contact sheet. A quality failure gives a nonzero exit code. Fit checks still use temporary per-page PDFs and images in memory to check physical page count, QR codes and printed ink.

## 2. Review the fake change

Keep the last sample folder. Use a different output folder for each comparison:

```sh
node scripts/workbook-samples.mjs --fake --no-store --levels U16 --days 1,5,10 --concurrency 3 --diff /tmp/ui-review/last-fake-u16 --out /tmp/ui-review/round-fake-u16
```

On the first round, omit `--diff` to make the baseline. The same rule applies to replay when no real cache exists yet.

Read `U16-pages.md`, then `U16-diff.md` and `U16-changed.png`. Read the text for every question. Inspect the changed-pages sheet instead of opening every page image. The sheet places the old and new pages side by side. Removed pages keep their old image. If the old folder has no page image, the sheet shows the new image only. With no changes, the sheet says so.

Each text dump gives the page kind, title, instruction, all template text and each question's printed text, choices, answer and check status in template order. It also gives fit, omission and question warnings. The text dump describes the template content. The strict render checks whether that content prints.

The diff uses `<label>-pages.json`. It compares text, answers, warnings, template HTML and CSS. Desk tokens do not cause changes. A CSS change can mark all pages, including pages where the changed selector has no effect. This conservative rule keeps layout changes visible. A comparison requires a baseline from this version of the tool.

## 3. Run one final real pair

At the end of a round, run exactly one U4 and U16 pair in parallel. Replay the previous real samples. Use the subscription only. Keep both output folders separate:

```sh
env -u OPENROUTER_API_KEY -u OPENROUTER_API_KEY_FILE -u ANTHROPIC_API_KEY -u ANTHROPIC_API_KEY_FILE WORKBOOK_CLAUDE_CONFIG_DIR=/Users/savargupta/.claude_second node scripts/workbook-samples.mjs --subscription-only --no-store --levels U4 --days 1,5,10 --concurrency 3 --replay /tmp/ui-review/last-real-u4 --diff /tmp/ui-review/last-real-u4 --out /tmp/ui-review/round-real-u4 > /tmp/round-real-u4.log 2>&1 &
u4_pid=$!
env -u OPENROUTER_API_KEY -u OPENROUTER_API_KEY_FILE -u ANTHROPIC_API_KEY -u ANTHROPIC_API_KEY_FILE WORKBOOK_CLAUDE_CONFIG_DIR=/Users/savargupta/.claude_second node scripts/workbook-samples.mjs --subscription-only --no-store --levels U16 --days 1,5,10 --concurrency 3 --replay /tmp/ui-review/last-real-u16 --diff /tmp/ui-review/last-real-u16 --out /tmp/ui-review/round-real-u16 > /tmp/round-real-u16.log 2>&1 &
u16_pid=$!
wait "$u4_pid"
u4_exit=$?
wait "$u16_pid"
u16_exit=$?
printf 'U4 exit=%s\nU16 exit=%s\n' "$u4_exit" "$u16_exit"
```

Use full books when the affected level needs full-book evidence. Do not repeat real samples after each small fix. If a subscription cannot take the calls, report that limit. Do not use an API fallback.

`--replay` loads every `*-ai-cache.jsonl` file in the supplied folder. Each line stores the exact model, JSON request, SHA-256 request hash and response. The request includes the system prompt, all inputs, schema, effort and token limit. A change to any of these causes a new call. The independent solve check captures the current public solver request. It replays only if the printed question, choices, picture description, prompt and schema are identical. The solver never receives the answer key.

The replay run copies reused records into its new cache. The index reports replayed and new logical calls, split by writer and solve check. Provider counts report actual subscription requests, including retries. Failed calls do not create cache entries. Keep the newest complete real cache for the next round. A fake cache cannot answer a real request because its model differs.

Replay and diff reuse the previous draft's workbook ID as the item seed. `WORKBOOK_SAMPLE_ID` overrides it when a fixed seed is required. Changed selection inputs or a changed seed can produce new requests. The output folder must differ from both source folders. Cache files contain sample prompts and responses. Keep them local.

## 4. Run the full gate once

Run the full gate once, immediately before the push. Check each exit code. Read the `Test Files` line from plain `npm test`.

```sh
npm test > /tmp/workbook-round-test.log 2>&1
test_exit=$?
printf 'test exit=%s\n' "$test_exit"
rg 'Test Files|Tests|Duration' /tmp/workbook-round-test.log
```

```sh
npx eslint src
```

```sh
npm run build
```

## Done criteria

A generator PR can merge when the checks pass, the Codex review has no P0 or P1 findings, and Savar approves the sample for the level that matters. Put smaller findings in a follow-up PR instead of starting another generator round. Savar controls the merge.

## Timing and proof limits

The sample CLI uses one Chromium process per run and reuses its pages. It uses the production print engine's measurements, QR reader and ink checks. An exact in-run cache includes HTML, CSS, embedded fonts, QR code, page size and image scale. A passed final fit stays available until the book ends. The output stage runs the public strict renderer per page, reuses those exact prints, prints only failed pages again with review marks, and joins the one-page PDFs in order. Independent pages and file writes can run in parallel. No retry delay is part of the normal path.

`<label>-profile.json` reports planning, generation, capacity fits, final fits, item writing, solving, output, review print, PDF assembly, contact sheet, text dump and diff timing. It also reports browser launches, created browser pages, documents, screenshots, PDFs, cache hits and per-page fit-call counts. Concurrent request durations are sums and can exceed wall time. `generation`, `full-output` and `total` are wall spans. Generation includes planning, item work, fit checks and the book check. The small remaining generation time covers code outside the measured dependency calls.

The fake sample proves the selected local generation and print path. It does not prove real AI wording, hosted operation or sample approval. The real replay proof establishes exact request reuse. It does not replace Savar's review.

Measurements on 2026-11-03 used U16 days 1,5,10, concurrency 3 and the fixed seed `17fc5da1-2442-488a-a450-611a471e73e6`. Other agents also used the machine. The before and after drafts have identical content, question text, answers, checks and counts: 28 pages, 195 questions, zero failed questions, zero fit failures and zero omissions.

| Stage | Before, seconds | After with diff, seconds |
|---|---:|---:|
| Initial plan | 0.017 | 0.015 |
| Fake item writing, cumulative | 0.026 | 0.035 |
| Chromium fit prints | 207.98 | 23.35 |
| Full output, including PDF assembly | 15.11 | 5.00 |
| Review print | 0 | 0 |
| Contact sheet | 0.41 | 1.30 |
| Text dump | Not available | 0.14 |
| Page diff | Not available | 0.007 |
| Whole command wall time | 233.98 | 36.14 |

The remaining generation time outside fit and fake AI calls fell from about 8.16 to 3.44 seconds. The after run spent 14.52 seconds in capacity fit calls and 8.93 seconds in final fit calls, including cache lookups. There were no failed pages to review-print in this timing sample. The failure-path test verifies that a failed strict page receives a proof print and passing pages do not.

Chromium launches fell from 88 to 1. Physical fit documents fell from 87 to 68. The complete output used only two more documents for the non-day pages. The cache reused 45 prints. The before sample took 394 screenshots; the after sample took 235, including the ink checks. The final `workbook:fast` check-only command took 33.43 seconds, including startup, while the full test gate ran on the same machine. It wrote no PDF, page image files or contact sheet.

The baseline fit-render distribution across 26 checked pages was: 10 pages with two renders, 13 with three, one with four, and two with twelve. The new distribution is four pages with one render, 18 with two, two with three, and two with eleven. The repeated capacity trials remain binding. The sample tool does not change the generator's layout decisions.

| Subscription sample | Wall seconds | New calls | Replayed calls | API calls |
|---|---:|---:|---:|---:|
| U4 first run, parallel with U16 | 107.20 | 15 | 0 | 0 |
| U16 first run | 303.38 | 54 | 0 | 0 |
| U16 replay with diff | 52.33 | 0 | 54 | 0 |

The real U16 replay reused all 12 writer requests and all 42 solve requests. The two runs have identical page manifests and exact request-hash counts. The diff lists zero changed pages. Two initial solve disagreements triggered the same repairs in both runs. Both final drafts have zero failed questions, fit failures, omissions and render problems. The U4 sample also passed these checks. The second U16 run is the replay proof required for this tooling change; later rounds use the single final pair above.

Local evidence: `/tmp/ui-review/fast-u16-before`, `/tmp/ui-review/fast-u16-final-fake`, `/tmp/ui-review/fast-u16-final-check`, `/tmp/ui-review/fast-u4-a`, `/tmp/ui-review/fast-u16-a` and `/tmp/ui-review/fast-u16-b`. Command logs use the prefix `/tmp/workbook-fast-loop-`.

Final verification: plain `npm test` exited 0 with `Test Files 292 passed (292)` and `Tests 12795 passed (12795)` in 265.00 seconds. `npx eslint src` and `npm run build` both exited 0. The 16 sample-tool tests took 303 ms in the last focused run. The pooled Chromium control accepted the normal page and rejected invisible question ink and a hidden QR code. PDF text extraction confirmed the same printed text on all 28 pages in the same order. These checks cover local sample tooling. Hosted operation and Savar's sample approval remain separate.
