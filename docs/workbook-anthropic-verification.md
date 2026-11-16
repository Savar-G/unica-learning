# Direct workbook API verification

November 16, 2026. Source base `45222b0be65b5fefe9583ede6854beeb8a285892`. Scope: the explicitly authorized direct Anthropic Book 1 runs, not the assessment report or Maya.

- Free Anthropic token-count preflight returned HTTP 200. No paid generation request had been sent at the time this implementation was committed.
- Focused randomized tests passed: five files, 72 tests, seed 1612. This includes writer routing, durable request accounting, subscription isolation, schema retry limits and worker startup.
- Persistent spending guard: ten Node tests passed, including concurrent reservations, restart, unknown billing, wrong model, malformed or null token counters and refusal before dispatch at the cap.
- Full suite initially passed 942 files and 30,087 tests, with four failures in the worker-entry fixture. Its temporary external bundle could not resolve the newly imported SDK. Giving that fixture the installed dependencies used by the real worker resolved all four failures. All eleven worker-entry tests passed in the focused rerun; their assertions and safety cases remain intact. The full suite was not repeated after this fixture-only repair.
- `npm run typecheck`, `npx eslint src` and `npm run build` passed. The standalone runner's `--help` loaded without credentials or network.
- Fake U4 and U16 strict samples passed with no failed questions, fit failures, omitted content or render problems.
- One final U4/U16 pair replayed the existing real samples in parallel. U4 had 28 pages and 248 questions, with no AI requests. U16 had 28 pages and 203 questions, reusing all 43 saved AI responses including 37 solve checks. Both passed and both changed-pages sheets report zero changes. Network fetch was disabled in those replay processes, and no usable API key was supplied. These are replay and physical-fit evidence, not fresh AI content verification.
- Separate requirements and standards reviews found a missing-usage accounting defect, fixed by retaining the reservation and halting. Requirements review also found a Book1 admission race and a missing continuation route. The runner now rechecks the transactional run's identity and number, and supports explicit same-build, same-model, same-budget continuation under the normal lease.

Local artifacts: `/tmp/workbook-live-full-test.log`, `/tmp/workbook-live-worker-red.log`, `/tmp/workbook-live-worker-fixed.log`, `/tmp/workbook-live-budget-final.log`, `/tmp/workbook-live-full-eslint.log`, `/tmp/workbook-live-full-build.log`, `/tmp/ui-review/anthropic-api-fake` and `/tmp/ui-review/anthropic-api-replay-u4`, `/tmp/ui-review/anthropic-api-replay-u16`.

Live completion, complete PDFs and sample approval remain separate checks. A stored draft or a completed run alone does not prove that every page is ready to print.

## Full-book layout follow-up

The first authorized live retry stopped during planning, before any paid request. With its exact seed and saved inputs, Page 37 ended with an empty cell. The row-exchange repair was restricted to grids that already fit, although closing the odd groups removes the extra row responsible for overflow. The repair now checks the resulting pages even when the original grid overflows. Its existing task, step, timing and physical-fit checks remain binding.

The full local build then exposed insufficient LCM practice on Page 41. The existing restoration of a practice page's own-step minimum was limited to U16. It now covers every level from U10, matching the existing book-quality rule. It still replaces a pair together, checks complete rows and verifies physical fit.

Independent review identified an existing synthetic U19 seed that could not pass the expanded check while its page was still over capacity. Coverage restoration now runs after normal count/overflow repair reaches a complete fitting grid, before that grid is accepted. All four affected files pass 21 tests in randomized order, seed 1615. The row-swap, missing-contract and own-step checks remain intact; temporary diagnostics were removed.

Two public-interface regressions fail with their respective old conditions and pass with the fixes. The exact ten-day local book now has 64 pages and 507 checked questions, no failed or unchecked questions, no failed pages, no dropped content and no quality issues. This uses fake writer responses and a code-key solver. It proves this seeded local generation and physical-fit path, not real AI wording or approval. The original custom instructions remain unchanged, including the intentional U19 start and the unapplied fourth review topic. Root owns `workbook-generator.ts` for this follow-up; no quality rules changed.

Evidence: `/tmp/workbook-live-capacity-red.log`, `/tmp/workbook-live-capacity-fix2.log`, `/tmp/workbook-live-grid-regression-red.log`, `/tmp/workbook-live-ownstep-red.log`, `/tmp/workbook-live-gerald-fake-full-fixed.log`. Private input, fit cache and fake draft remain outside Git in `/tmp/ui-review/packson-live/`.

The final U4/U16 replay pair exited 0 with no new API requests. U4 retained 28 pages and 248 questions with zero changed pages. U16 retained 28 pages with 197 questions, all 43 saved AI responses reused and five changed pages. The changed-pages sheet and printed text were reviewed; all pages fit, all adopted minimums remain satisfied, and no omission or left-out content was recorded.

The full follow-up test run passed 942 files and 30,092 tests. One generated-workbook integration fixture still used the old page positions of five missing-factor equations. It found all five questions but failed when a question moved. The fixture now finds the same five exact factor/product equations by their printed text, retaining all operation, answer, tutor and printed-operand checks. The isolated real-fit CLI test passed in 92 seconds. The full suite was not repeated for that test-only repair.

The follow-up `npx eslint src` and `npm run build` both exited0. Logs use `/tmp/workbook-live-layout-full-*` and `/tmp/workbook-live-layout-integration-fixed.log`.
