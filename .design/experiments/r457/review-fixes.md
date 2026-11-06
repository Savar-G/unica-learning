# S4 review fixes and parent verification

Machine: Savars-MacBook-Pro-5.local. Reviewed implementation: df0c145a5952573dcdbf793844b2c47fcd323b37, base 89ecf73965eccbf0f59e49401b69cf09a4e12579. Both independent reviews returned FAIL. Their fixed source stayed unchanged until both reviewers stopped.

## Written findings and fixes

- Spec P1: frozen review parts were compared with an unused value. Friday 5, Mixed and Show what you know now reach the page-based mastery rule. Practice and an invented review tag stay excluded. Five public workflow cases pass through both the effective projection and skill-state rule. The acceptance probe failed before the fix.
- Spec P2: a profile save could hide an unpublished intent after expiry/deletion. The cursor now selects pending original intents independently of the image state and saved profile revision. Two concurrent SQL cases cover the profile save, image end, cursor, event insert, acknowledgment and subsequent profile save. Both acceptance cases failed before the fix.
- Spec P2: time could expire while dispatch waited for the global budget lock. Admission rechecks the locked photo and job deadlines after that lock. Both deadline cases now produce no reservation, dispatch row or attempt increment. Both acceptance cases failed before the fix.
- Standards P2: valid long item IDs exceeded the event-key boundary. Stored event intents now use SHA-256 of the canonical identity, with an identical PostgreSQL lookup. Keys are 72 characters across retakes. Public package/workflow cases pass for ID lengths 50, 89, 90, 100 and 200. Local SQL also checks 200-character ASCII and UTF-8 IDs. The independent original probe passed at 50/89 and failed at 90/100.
- Shared-limit observation: calibration was outside the active count. Normalization, calibration and marking now acquire the same family lock and count the same leases. Six SQL cases check calibration with each other stage in both orders and concurrently. The private count helper has no browser or service-role execute grant.
- Compatibility correction: the shared calibration admission must retain the existing previous-lease cleanup token. An additive correction and a takeover regression preserve it. New calibration returns null as previous; takeover returns only the replaced token. An active lease remains busy.
- Browser defects: cold result loads did not import the scan styles or use the standard page frame. A 200-character reading overflowed a 390-pixel viewport to 2056 pixels. The result component now owns its styles, the route uses SupportPage, readings wrap, and the refresh control is at least 44 pixels high. No new visual direction was introduced.

## Checks

- Full tests: 426 files passed; 16,390 tests passed; 1 optional skip; exit 0. Root log: /tmp/pd457-root-full-test.log. The final page-frame/CSS changes were followed by the affected result/publication tests, full lint and production build rather than another full suite.
- Local SQL: 32 passed, 0 failed, exit 0. See root-sql-tests.log. The dedicated root PostgreSQL server is stopped. Only disposable synthetic rows were used.
- Affected final result/publication tests: see /tmp/pd457-root-ui-final-tests.log. The first new test had TypeScript narrowing errors. The errors were fixed, and the final TypeScript and build checks passed without type overrides.
- Final source lint: /tmp/pd457-root-lint-final.log, exit 0.
- Final production build after removal of the development fixture: /tmp/pd457-root-build-release.log, exit 0.
- Browser: 21 state/viewport cases passed at 390, 820 and 1280 pixels. Eight screenshots and browser-checks.json are stored here. A long child name and 200-character readings fit. Keyboard focus is visible with a 2-pixel outline; Enter submits Refresh and preserves the selected state. The owned browser tab was closed and the task-owned development server stopped.

## Hosted database

Applied scan_marking as 20261106001050 and the additive scan_calibration_previous correction as 20261106001331. Generated types came from the normal db:types script after application. The seven tables have RLS and no direct browser/service write grant. Write RPCs are service-only with empty search paths. All four family-owned tables have child/family fences and cascades. The internal count helper is private. No marking price is enabled.

The committed scan_marking_hosted.sql probe reached SCAN_MARKING_HOSTED_PROBE_OK. It ran under actual anon, authenticated and service roles. It checked the previous calibration token, canonical UTF-8 key, unverified-price refusal with no spend, extraction/application, profile save, expired outbox recovery, publication acknowledgment, child cascade, sibling preservation and late-job refusal. Every synthetic row rolled back; zero probe parents remained. It did not create any Storage object or provider request.

The security advisor reports informational no-policy notices for intentionally private RLS tables and an authenticated-definer notice for the owner/admin-scoped image predicate. No access was widened to remove an advisor notice. Real Storage HTTP download/signing behavior remains a release check.

The other controller owns PR637 and its scan_sent_check Send repair, installed as 20261106001155. S4 changes no Send function. The observed post-change send_scan_photos definition hash is ed3be6821e4bec1d105dd5b68da78321. Do not replace it during later integration.

## Limits and next steps

The browser harness used synthetic result props in the real component and dashboard frame. It was removed before the final build. It is not authentication, actual image delivery or deployed scheduling evidence. The hosted SQL fixture uses synthetic geometry and is not a real printed-artifact or camera acceptance test. No handwriting accuracy, provider privacy setting, verified price maximum or Sonnet/Haiku comparison was tested. No live family, paid provider call, push, PR or merge ran in this verification round.

Keep family scanning and dashboard release off. Obtain an independent recheck of the fixes. Complete the PR637 whole-sheet gate, sample approval, private image HTTP checks, provider privacy/pricing and fixed-set recognition evaluation before any family release. The dependent correction/history/final dashboard slices still follow their own merge and approval order.
