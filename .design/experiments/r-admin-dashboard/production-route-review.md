VERDICT: APPROVE c5ad20f551ebac58b7cd6949f121c71e4ab7dcd4

No reproducible finding in the required scope. This review gives no merge or release approval.

Computer: Savars-MacBook-Pro-5.local.
Reviewer: Codex gpt-6.1-sol, high reasoning effort. No additional agent ran. The brief authorizes the Mac fallback because the controller cannot assign an exclusive PC checkout.
Requested worktree: /Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-bda8c699.
Resolved worktree: /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-bda8c699.
Branch: site/admin-parent-dashboard.
Fixed head: c5ad20f551ebac58b7cd6949f121c71e4ab7dcd4.
Dependency: 6acaa2637ad88f88462800a056cdeddcc90678e2, merged S5 with the PR671 reader extraction.
Prior reviewed head: c1089b67d7fdda4e32f5b58fd55cf224e9ec32d6.
Source status: clean before and after checks. HEAD did not change.

Read the brief first and grepped HANDOFF_PD_ADMIN_PRODUCTION_ROUTE_REVIEW before the source review. Read the applicable AGENTS.md, production-route.md, production-route-browser.json, s5-integration.md and the prior review records. Used the Unica evidence review procedure within the brief's limits.

Scope and rebase check

Compared the feature against the fixed dependency. Compared the route and S5 increments against 19335ec1. The increments affect 9 source or test files. The S5 increment changes only the sample projection in admin-parent-preview.tsx. The route increment adds the canonical page, preserves the old page as an export, changes navigation and selection paths, and extends analytics exclusions.

Ran git range-diff c1089b67d7fdda4e32f5b58fd55cf224e9ec32d6~8..c1089b67d7fdda4e32f5b58fd55cf224e9ec32d6 6acaa2637ad88f88462800a056cdeddcc90678e2..19335ec1. All 6 earlier Admin feature and evidence commits have equal patches after the rebase. Commit 19335ec1 adds only Auth evidence. S5 changes from main are dependency changes, not new Admin changes. No silent Admin feature change was found in the rebase.

Falsifiers stated before checks

A failed Admin guard, desk lock bypass, preview from a non-Admin or demo request, wrong sign-in return, lost selection field, old canonical selection URL, analytics event from a preview, active account control, provider call, or incorrect S5 sample mark would disprove the required behavior. A changed earlier Admin patch would disprove rebase preservation.

Independent checks

Command:
./node_modules/.bin/vitest run --maxWorkers=2 --no-cache src/components/admin-parent-dashboard.test.ts src/components/admin-parent-preview.test.ts src/components/parent-preview-analytics.test.ts 'src/app/(product)/admin/parent-dashboard/page.test.ts'

Result: 4 files passed. 134 tests passed. Zero failures. Exit 0. Duration 3.49 seconds. No test file was created or changed.

A bounded Node stdin check compiled the public functions in memory with the installed esbuild. It wrote no files. It checked safeNext, isParentPreviewPath, previewSelection, previewUrl and deskGate.

- Sign-in return: 4 cases passed for both Admin addresses, with all query fields and a hash, including an encoded callback round trip.
- Preview path exclusion: 12 cases passed for exact, slash, query, hash, nested and absolute forms of the two addresses.
- Normal path controls: 5 cases passed. Similar path prefixes and normal pages remain outside the preview filter.
- External return controls: 3 cases passed. External and parser-normalized external targets return /account.
- Desk gate: 4 cases passed. Both paths return to the desk for a matching lock, including an unknown session state.
- Selection URLs: 2,232 input combinations passed across every catalog view and scenario, 3 sizes, 4 family values and 2 child values. Every URL uses /admin/dashboard and retains all 5 normalized selection fields. Some inputs normalize to the same selection.
- Prior predicate control: 3 comparisons passed. The pre-route predicate misses /admin/dashboard, the current predicate covers it, and the prior predicate covers the legacy address. This independently proves that the new exclusion changes behavior. It does not repeat all 3 supplied pre-fix test failures.

Total bounded cases: 2,263 passed, zero failures. The case counts come from the same loops that made the assertions. The final source-file count remains 9. The required test-file count remains 4.

Subsystem results and proof limits

| Subsystem | What the review proves | What it does not prove |
| --- | --- | --- |
| Page authorization | dashboard/page.tsx:11 awaits requireAdmin before reading the selection or rendering. parent-dashboard/page.tsx:2 exports the same page. Both public page tests reject mocked guard failures, including demo queries. admin-store.ts:59-77 requires a verified user and is_admin strictly true. | Page tests replace the Admin service. No independent hosted identity or role check ran. |
| Desk lock | The proxy matcher covers /admin/:path*. Both pages inherit AdminLayout and DeskGuard. The public deskGate checks deny both paths under the matching lock. | No browser restoration or hosted proxy request ran. |
| Sign-in return | account.tsx:479-487 passes next to router.replace after password success. account.tsx:774-775 encodes next in Google's callback. The callback validates next after a successful code exchange. Public safeNext checks preserve both Admin destinations and reject external targets. | No fresh Google, password, email or provider request ran. |
| Navigation and selection | admin.tsx:31 uses /admin/dashboard. All PARENT_EXPLORER_PATH consumers were inspected. The mounted control test and bounded URL cases preserve normalized fields and reset invalid scenarios. | No browser navigation or deployed-route check ran. |
| Analytics | All isParentPreviewPath consumers were inspected. SiteAnalytics excludes both paths. Its event filters drop both addresses even for an earlier loaded SDK. VisitTags skips visit and ad effects. The public tests and bounded path controls pass. | The tests replace analytics and ad services. No live SDK traffic was observed. |
| Static frame | The mounted shell test requires sandbox allow-same-origin, no src and no-referrer. Public renderer tests cover every catalog scenario. They reject active links, forms, scripts and enabled controls. Provider, fetch and tracking spies stay unused. | DOM tests do not prove browser sandbox enforcement. |
| S5 sample compatibility | admin-parent-preview.tsx:106-115 supplies canChange, actor, at, evidencePhoto and photoAvailable. Pending and budget samples contain no scored item. Uncertain and unscored answers have null results. Unscored items cannot change. Expired samples mark the photo unavailable. The real shared renderer displays the required pending, unscored and expired words. The call at line 162 omits photo, so ScanMarkChange and its private-image/provider path do not mount. | Sample data does not exercise persisted mark changes, recovery, hosted permissions or private photo delivery. The accepted read-only limit remains in force. |

Source whitespace check passed: git diff --check 6acaa2637ad88f88462800a056cdeddcc90678e2 HEAD -- src. An earlier check across all feature files found only trailing whitespace and final blank lines in committed main670 build/test logs. These log-format results are not product findings.

Supplied evidence

Root records 3 expected test failures before the route fix, then 134 passes, source lint exit 0 and normal build exit 0 with both routes. Root's browser record reports a local Google callback with HTTP 303, then HTTP 200 at the canonical route. It reports working selection changes, the legacy expired-photo view for Kai, zero active frame-body controls, and an incognito demo request with HTTP 404 and no preview. Snapshot capture timed out. No new screenshot exists. The earlier exact preview Auth URL repair remains outside this change.

These are supplied results. This reviewer did not repeat the full suite, lint, build, browser, Auth or hosted checks. They do not prove production deployment. Current remote CI and other review states were not queried.

Completion

All reviewer commands and the owned Vitest process exited. No owned review process remains running. No server or browser started. No source, Git, hosted, Auth, provider, email, flag, account or PR state changed. No paid call, install, push, merge or watch ran. Writes are limited to this report and the required brief completion marker.

VERDICT: APPROVE c5ad20f551ebac58b7cd6949f121c71e4ab7dcd4

PR https://github.com/Savar-G/unica-learning/pull/673, head c5ad20f551ebac58b7cd6949f121c71e4ab7dcd4, checks and reviews 134 focused tests passed; 2263 bounded cases passed; independent review APPROVE; remote CI and other reviews not checked.
