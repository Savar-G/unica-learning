# Workbook failure recovery (#1114)

This first slice fixes failure handling, not the underlying U19/U10 layouts. It does not change customer instructions, provider selection, thresholds, question counts or fit/approval rules. Branding #1112 stays queued.

## Planning failures keep their real cause

`prepareWorkbookCapacity` raises `CapacityProblem` when a deterministic plan cannot fit. Previously the job recorded that error and immediately retried. No frame had been saved, and the error history itself counted as stored work, so the retry replaced the fit failure with “no stored plan”.

The job now ends that attempt with the original capacity error. The guard against re-planning over stored work is unchanged. Transient failures retain the existing retry path.

## A lasting provider outage stops the run

The fallback client distinguishes exhausted/unavailable providers with `WorkbookAiUnavailable`. A lasting failure with no fallback, or a restored gate with no usable provider, propagates through the writer and independent solve check to the job. It fails the run without rendering or storing an incomplete draft. Existing per-provider usage/exclusion logging and all already-saved work remain intact.

A temporary subscription-process crash remains retryable. An available, already-configured fallback still works. No provider is enabled, changed or given a new budget by this patch. Single-dispatch edit behavior is unchanged.

The admin's collapsed AI section shows unavailable attempts and missing results instead of “No AI calls logged yet”. Subscription labels no longer incorrectly identify every subscription as Claude; the saved model and outage reason retain the actual provider information.

## Regression evidence

- Five new cases first failed on the previous behavior: capacity error masking, unavailable writer, unavailable solver, restored provider outage, and the misleading admin summary.
- The focused job/generator/fallback/workbook-AI/solve-check/admin suites pass 305 tests, including temporary-crash recovery, mixed temporary/permanent provider failures, concurrent fallback exclusion, outage during an incomplete-response retry, and waiting for sibling quality-gate persistence before an outage escapes.
- Tests use public interfaces, synthetic data, in-memory stores and fake providers. No customer generation was restarted and no paid request was made for these tests.
- Local logs: `/tmp/workbook-failure-red.log`, `/tmp/workbook-failure-focused.log`.

Independent review found two P2 edge cases: the last fallback's lasting failure could hide a still-retryable primary, and a solver rejection could escape before a sibling quality gate saved. Both now have regressions that failed before their repair (`/tmp/workbook-failure-review-red.log`) and pass afterward (`/tmp/workbook-failure-review-focused.log`). The initial full-suite attempt was stopped as obsolete after these findings; it is incomplete, not a pass.

A fresh review confirmed those repairs and found a concurrent version of the first problem: a sibling could exclude the fallback after the call took its initial provider snapshot. The final loop exit now rechecks current eligibility too. Both provider orders failed the new regression before the one-line repair (`/tmp/workbook-failure-race-red.log`) and pass in the final 305-test focused run (`/tmp/workbook-failure-final-focused.log`).

## Layout work still required

Seed `17fc5da1-2442-488a-a450-611a471e73e6`, fake AI, no-store, strict Chromium fit checks:

- A synthetic U19 first-book plan with the requested start/teach-more/review selections reproduces **Day 5 page 4, on-your-own, 25px overflow** before any writer call. The reduced-days sample numbers it page 12. Its synthetic profile is not the customer's frozen profile; review-selection outcomes are therefore not identical.
- A diagnostic fit capture shows five missing approved question contracts in that page's on-your-own block. Spacing its failure placeholders eventually overflows. Hiding placeholders, inventing stand-ins for missing contracts or loosening the fit check would not repair the missing required content. Routing/contract availability still needs its own fix and regression.
- A synthetic U10 catch-up plan confirms review 2.4 applies and teach-more 3.3 is deferred for prerequisites/space. With an answering fake writer, its Day 8 practice page still fails occupied-height fullness (83%). This is a local reproduction, not proof that the historical customer draft is repaired.
- Baseline outputs: `/tmp/ui-review/workbook-failure-u19-before`, `/tmp/ui-review/workbook-failure-u10-before`; detailed synthetic U19 measurements: `/tmp/ui-review/workbook-failure-capture/history.json`.

Issue #1114 stays open. Existing incomplete drafts are not made approvable by this patch. The approved paid API rerun for #936 is a separate test authorization, not permission to bypass failed content or print checks.

## Release checks

- `npm run workbook:fast`: fake U4 and U16 days 1,5,10 each pass strict checks with zero failed questions, fit failures, omissions or render problems. U4 has 249 questions; U16 has 199. Output: `/tmp/ui-review/workbook-failure-regression`.
- The subscription-only pair was attempted with all API key variables removed. U4's code-only output reports ready (248 questions; no provider calls). U16 fails before a usable answer with a subscription-login refusal, rather than continuing into blank questions. The configured identity differs from the CLI's default Keychain identity: default `claude auth status` is logged in, but setting `CLAUDE_CONFIG_DIR=/Users/cedrictanafranca/.claude` reports logged out. This is an environment/configuration limitation, not proof that real U16 wording passes.
- Both sample child processes remained idle after logging `done`; only those completed, stalled children were terminated, with all logs/output retained. Therefore the attempted pair does not have clean successful exit evidence. No API fallback was enabled. Logs: `/tmp/workbook-failure-real-u4.log`, `/tmp/workbook-failure-real-u16.log`.
- Round 2 used the same default logged-in account without the explicit configuration override. A temporary local bootstrap awaited the unchanged sample entry module and exited with its final exit code after all output/browser cleanup, avoiding unrelated lingering handles. It is not shipped. Both samples used replay folders (there were no prior successful model responses to reuse). U4 exits 0, passes all checks, and has **zero changed pages** against the preceding U4 output. U16 exits 1 with the account's weekly usage-limit refusal (reported reset: Nov 18, 4pm America/Vancouver); no usable writer answer or API fallback. Logs/output: `/tmp/workbook-failure-round2-u4.log`, `/tmp/workbook-failure-round2-u16.log`, `/tmp/ui-review/workbook-failure-round2-u4`, `/tmp/ui-review/workbook-failure-round2-u16`. This does not establish a reset time for the Mac worker's separate Codex account.
- Aside browser QA on a temporary synthetic local route passed at 390px and 1280px: the failed run preserves its quota reason, the closed AI section says unavailable, expanded details show the selected provider without calling it Claude, and there is no horizontal overflow. The route was removed, the owned tab closed and the dev server stopped. Evidence: `/Users/cedrictanafranca/.aside/u/0/sessions/2026-11-15_50P4oRa7BDfYQzwM/artifacts/`.

The full gate, successful real sample/replay evidence, browser check and independent review must be recorded before this slice is ready to merge. Generator sample approval remains with Savar under `docs/workbook-rounds.md`.
