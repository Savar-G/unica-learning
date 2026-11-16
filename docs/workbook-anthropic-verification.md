# Direct workbook API verification

November 16, 2026. Source base `45222b0be65b5fefe9583ede6854beeb8a285892`. Scope: the explicitly authorized direct Anthropic Book 1 runs, not the assessment report or Maya.

- Free Anthropic token-count preflight returned HTTP200. No paid generation request had been sent at the time this implementation was committed.
- Focused randomized tests passed: five files, 72 tests, seed1612. This includes writer routing, durable request accounting, subscription isolation, schema retry limits and worker startup.
- Persistent spending guard: ten Node tests passed, including concurrent reservations, restart, unknown billing, wrong model, malformed or null token counters and refusal before dispatch at the cap.
- Full suite initially passed 942 files and 30,087 tests, with four failures in the worker-entry fixture. Its temporary external bundle could not resolve the newly imported SDK. Giving that fixture the installed dependencies used by the real worker resolved all four failures. All eleven worker-entry tests passed in the focused rerun; their assertions and safety cases remain intact. The full suite was not repeated after this fixture-only repair.
- `npm run typecheck`, `npx eslint src` and `npm run build` passed. The standalone runner's `--help` loaded without credentials or network.
- Fake U4 and U16 strict samples passed with no failed questions, fit failures, omitted content or render problems.
- One final U4/U16 pair replayed the existing real samples in parallel. U4 had 28 pages and 248 questions, with no AI requests. U16 had 28 pages and 203 questions, reusing all43 saved AI responses including37 solve checks. Both passed and both changed-pages sheets report zero changes. Network fetch was disabled in those replay processes, and no usable API key was supplied. These are replay and physical-fit evidence, not fresh AI content verification.
- Separate requirements and standards reviews found a missing-usage accounting defect, fixed by retaining the reservation and halting. Requirements review also found a Book1 admission race and a missing continuation route. The runner now rechecks the transactional run's identity and number, and supports explicit same-build, same-model, same-budget continuation under the normal lease.

Local artifacts: `/tmp/workbook-live-full-test.log`, `/tmp/workbook-live-worker-red.log`, `/tmp/workbook-live-worker-fixed.log`, `/tmp/workbook-live-budget-final.log`, `/tmp/workbook-live-full-eslint.log`, `/tmp/workbook-live-full-build.log`, `/tmp/ui-review/anthropic-api-fake` and `/tmp/ui-review/anthropic-api-replay-u4`, `/tmp/ui-review/anthropic-api-replay-u16`.

Live completion, complete PDFs and sample approval remain separate checks. A stored draft or a completed run alone does not prove that every page is ready to print.
