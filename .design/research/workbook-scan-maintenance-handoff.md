# #475 scheduler integration

MAINTENANCE_IMPLEMENTED_REVIEW_PENDING

Machine: Savars-MacBook-Pro-5.local. Branch: site/workbook-scan-receipts-475. Base:5e4dd0c778cf42f9f8ecd3b3289ddf2541f9b000. Actual implementation: Unify Codex gpt-6.1-sol high.

The previous calendar/email/sender/store slice has independent Sol APPROVE at5e4dd0c7. The report is retained. This new slice needs independent review.

- runWorkbookScanMaintenance composes bounded selection, rollout checks, delivery-clock recovery, inactivity calendars and one complete current due set per parent. Its clock is execution budget only. SQL remains the decision authority. A thrown read stops the turn.
- createWorkbookScanMaintenanceServer is default OFF with no real-family mode. Explicit listed test parents must retain test markers. Delivery remains separately off. The server rechecks the marker before dispatch admission. Counts-only results contain no family/book identities.
- Test-only selection scopes configured parent deliveries before limiting. The existing global queue could otherwise starve test books behind excluded real families. The complete selected set is bounded at5; overflow/truncation/missing counts fail visibly.
- workbookScanClockRequestsForBooks scopes clock requests by selected book IDs before the count/limit. It shares the existing request parser and leaves current-identity/calendar conflicts to SQL. Test books with too many saved requests stop with a bound error; no partial coverage is claimed.
- Existing /api/reminders preserves authentication, global email-configuration guard and dry behavior. With the feature off it uses its original transport path. With the test feature on, every old and new send uses the same factory transport. New scan work ends at55seconds and has an aborted database client.
- Integration found the prior email's wrong /account/scans destination. Exact route checks failed2cases against that source. The correction uses public scanPageUrl and /account/scan. The newToken helper returns token+hash; the server uses both fields, with no alternative hashing path.
- The Schedule/UI follow-up is adopted in the dashboard handoff. It will reuse existing day details, not a duplicate panel/tab/poller. No UI file is changed by this scheduler slice.

Falsifiers: another family's queue rows hide a selected test book; a truncated set becomes an empty set; removed test permission permits dispatch; a stopped/failed turn continues to another phase; a lost admission/unknown result permits another provider request; the ordinary mail path bypasses the shared queue; the email opens a missing parent route.

Negative controls: old route source failed2tests (exit1). Disabling the test-marker decision failed the listed-non-test-parent check (exit1). The complete source was restored before the final tests. Controls and final results are in /Users/savargupta/unica-workbook-samples/overnight-20261107/475-*.

No hosted service, provider, email, browser, Chromium, customer, family-switch, print, charge or plan-start operation ran in this implementation. The defaults remain off. No approved hosted email recipient exists. Hosted positive lifecycle/role proof, real test email/unsubscribe, Schedule design/approval, combined gate and publication remain with root. This does not complete475 acceptance.

## Final focused proof

- The combined475 cluster passed440tests in18files, exit0. It includes core/clock/store/reader/recovery/calendar/email/sender/maintenance, parent progress HTTP, existing assessment reminder/email-delivery and cron integration checks. No Chromium or full suite ran.
- Scoped TypeScript returned0diagnostics/exit0. Scoped ESLint exited0. Whitespace passed.
- A disabled current-test marker control exited1 and failed the listed-non-test-parent assertion. The restored server source SHA256 is dcd22122341a324edb1e81d454906bdaa32045201281d7be7031e9459e4812ea.
- The first expanded run found two older progress-store fixtures without the correction row's workbook number. The shared delivery reader correctly refused them. The fixture now supplies number2. A new wrong-number test retains accepted scans but refuses the foreign delivery. Disabling only the shared correction-number check made that test fail (exit1). The shared runtime source was restored SHA25663af48ea751b965cf45e070034efaadd7d3ab466e71106863d3efea7ed3c8dfc; no shared delivery runtime change remains.
- Scheduler source and tests use fakeHTTP and a fake provider. They prove configured parent/book scoping before bounds, complete-set failure, test gate removal before admission, unknown-result no-retry, one invocation transport and counts-only output. They do not prove hosted lifecycle/role permissions or real transport delivery.
- Existing cron tests prove the dry path does no scan work and a failed scan turn does not replay earlier emails or expose diagnostics. Its existing global email-configuration dependency is documented.

No owned check or server process remains. The worktree board is a read-only visibility check. Root will keep the committed source fixed during independent review.
