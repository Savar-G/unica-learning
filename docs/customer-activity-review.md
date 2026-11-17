# Customer activity review repairs

Frozen initial review head: 36c976438336ab53c43f1704ebdbe60377754e1d.
Two independent Sol reviews and a third settlement ran on the MacBook.

| Item | Result | Binding evidence |
|---|---|---|
| F1 empty UUID filters | Fixed | Exact empty form selections parse as null; the browser submitted All selections and retained working reads. |
| F2 optional plan log blocks access | Fixed | A pending activity promise remains unresolved while the public route opens access, confirms and releases its hold after the 300 ms deadline. A rejected write also preserves success. Billing was simulated. |
| F3 missing pre-book team actions | Fixed | Local SQL returns the saved run-start actor and run link; the hosted admin history also returns retained run and draft actions. No real action was written. |
| F4 completed book inactivity | Fixed | The existing canonical SQL scan identity suppresses finished, superseded and unsupported books. Shared TypeScript family-time arithmetic evaluates only admitted incomplete-book identities. Marking completion is separate. Existing canonical completion tests and the full suite pass. |
| F5 unreachable old books | Fixed | Local SQL selects Book 1 from 22 books and pages books 2 and 1. The panel loads an explicit selection with no child summary. The real local page loads ten printed days with only a book filter. |
| F6 inactive selection after paging | Fixed | SQL first selects incomplete canonical candidates. The server passes 26 recent candidates and returns a later inactive child before taking the displayed page. A failed or bounded read remains unavailable. No global inactivity total is claimed. |
| F7 child Maya link | Fixed | Child filtering applies to every safety-group query before its limit. Both directions retain the child in call paging links. Focused call-list tests pass. |
| F8 streaming body limits | Fixed | Both routes cancel an excessive open stream and return 413 before EOF. A stalled body returns 408 at two seconds. Private notes retain a separate character bound. |
| F9 plan-start test mock | Fixed | Updated the RPC mock and retained billing, access, confirmation and hold assertions. All 25 plan-start tests pass. |

The first full gate exposed a keepalive test import/mock failure for the new retention path. Its test setup and retained-purge failure check were repaired. The final full suite passes: 968 files passed, 3 skipped; 30,476 tests passed, 36 skipped. The first run's 30,471 passes did not constitute a passing full gate.

Additional verification: 69 shuffled repair tests; 35 retention/state checks; 362 voice tests; official database types/check generation; application typecheck; source lint; local PostgreSQL; actual hosted permission, admission, deletion-fence and cascade assertions. Final production build and final repair review are recorded in the companion activity document.

Rendered evidence uses the existing admin system at 1440 px and 390 px. The phone's measured content width is 375 px within a 390 px viewport; every tested form control fits. The sidebar finishes outside the phone viewport. Keyboard Tab reaches the family field and Enter submits the form. The synthetic note form saved and showed its author. One accepted optional attempt remains after the consent/retry/refusal cases. The synthetic family, child, notes and attempt were then deleted, with no linked activity left. The temporary admin session was revoked. No email or paid model/audio call ran.

Source limits: historical facts that were never stored cannot be reconstructed. Completion is a selected-book measure. Optional absence does not prove abandonment. No production feature deployment or real scan/Maya provider operation was tested.

## Final review correction

The independent final review of `941be1265` found one P2: the selected book in loaded position 21 was absent from the dropdown. The parent fixed the one-line visible-range check. The new test failed at position 21 before the fix and passed at positions 1, 20 and 21 afterward, with exactly one selected option. Fifteen focused tests passed across three shuffled files. No other concrete code issue or visual blocker was reported. The independent design score was 76/100, with limited lower-page image coverage. The final report is `.design/reviews/customer-activity-final-2026-11-16.md`. The complete done gate passed after the fix: 968 files and 30,479 tests passed, with 3 files and 36 tests skipped; source lint and production build passed.
