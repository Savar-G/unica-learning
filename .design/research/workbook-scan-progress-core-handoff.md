# Workbook scan progress core, #475

HANDOFF_READY

This is a local pure-core implementation. It does not complete #475 acceptance.

## Location and source

- Computer: `Savars-MacBook-Pro-5.local`.
- Prepared checkout: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-209efc43`.
- Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-209efc43`.
- Branch: `site/workbook-scan-progress-core-475`.
- Required merged base: `de9404ee545517387a241d79f19f1d70ab1e3201`.
- Implementation head: `b031b973310cc75fc0e07b150c3f2de28bdf6b40`.
- Handoff head: the documentation commit that adds this file. Resolve it with `git rev-parse HEAD`. The final task reply gives its exact SHA.
- Actual implementation model: Codex `gpt-6.1-sol`, high reasoning effort. The required legacy commit trailer names Claude Opus 5.5. That trailer does not identify the implementation model.

The prepared branch started clean at `550fdcf1619c0e515e8ac33e2a65869d8c937af7`. The ancestor check passed. The authorized fast-forward reached the required base. Only this prepared branch was renamed. No other checkout was used.

## Owned files and public API

Only these three new files belong to this task:

- `src/lib/workbook-scan-progress.ts`.
- `src/lib/workbook-scan-progress.test.ts`.
- `.design/research/workbook-scan-progress-core-handoff.md`.

`workbookScanProgress(input)` returns each frozen printed day's required page IDs, accepted page IDs, gaps, and completion. Its page rows keep `scanned`, `markingStatus`, and `reviewReady` separate. Required-page counts exclude Extra practice, covers, plan pages, and padding through the frozen manifest. An unsupported manifest or ambiguous page mapping refuses the whole projection.

The inputs reuse `ScanManifest`, `manifestProblem`, `isPrintedRevision`, `SNAPSHOT_DAY`, the page portion of `ItemIdentity`, `DeliveryReceipt`, and `deliveryDeadlines`. Marking rows reuse `HistoryPage` and `completedPage`. No store, service, photo, or model call runs in this core.

`AcceptedScanReceipt` is an explicit admitted durable record. The projection checks parent, child, workbook, printed revision, and page against the book. It excludes wrong identities, invalid or future times, empty photo revisions, and conflicting receipt IDs. Exact duplicates collapse. Same-page receipts count once. The earliest accepted receipt for a required page establishes its scan progress time. Later unchanged retakes do not change that time.

`AdmittedScanProgressEvent` is a separate durable store admission for a retake that resolves pending evidence. It names the accepted receipt and resolved items. The projection requires matching scope, a later accepted scan of that page, nonempty distinct item IDs, and a valid admission time at or after the scan. The scan time sets inactivity. Delayed admission does not move it to the job completion time. These fields do not prove that admission occurred. A Boolean from a client cannot substitute for this record.

Day 7 requires every frozen Day 7 page. A test workbook requires the full frozen level-test set. Earlier gaps remain visible. Days 8 and 10 cannot complete Day 7. A Day 7 candidate requires the matching effective delivery receipt. Scans received before delivery confirmation remain present.

`candidate` is only `day7_scanned`, `delivery_backstop`, or null. It claims no trigger, draft, snapshot, or arbitration result. At the 21-day confirmed-delivery boundary, zero accepted scannable pages return null with `holdReason: "no-accepted-scans-at-backstop"`. This implements the #628 HOLD rule. It does not advance by plan or repeat a book. Scored Extra practice can be accepted and reset inactivity without becoming required for a printed day.

`scanInactivityCandidate(input)` selects the child's latest numbered confirmed-delivered book. It returns the delivery or last qualifying scan anchor, the four-local-day deadline, and due status. A missing delivery receipt creates no delivery timer. Another child's book or scan cannot change the result. Book 2 uses its own receipt. Repeated confirmation record times cannot reset the anchor.

Delivery-only deadlines come from `deliveryDeadlines` and the effective receipt's recorded zone. Later qualifying scans use the passed resolved family zone. Calendar arithmetic uses `addDays`, `localDay`, `localDateTime`, and `partsInZone`. The core does not use a 96-hour duration. It uses the existing rules for dated zone overrides, an earlier repeated clock time, and the first valid clock time after a forward gap.

## Checks and proof limits

Each check had a stated failure condition before it ran.

- `npm test -- src/lib/workbook-scan-progress.test.ts --maxWorkers=1`: PASS, 1 file, 29 tests. The initial 24-test run passed before the added refusal and transition cases.
- `./node_modules/.bin/eslint src/lib/workbook-scan-progress.ts src/lib/workbook-scan-progress.test.ts`: PASS.
- Scoped TypeScript program with those two root files and their imports: PASS, zero diagnostics. It used the repository compiler options with `noEmit: true`, `incremental: false`, and no Next plugin. The first run found two fixture type errors. Both were corrected. No application build ran.
- Staged implementation whitespace check: PASS.

The checkout had no dependencies. `npm ci --ignore-scripts --no-audit --no-fund --cache node_modules/.cache/npm` installed the locked dependencies in this checkout. No package metadata changed.

Public tests cover out-of-order Days 1/7/8/10, Days 1-6 gaps, partial/full Day 7, two days in one sitting, late scans, duplicate receipts, conflicting receipt IDs, mismatched family/book/revision/page, optional pages, incomplete/full level-test sets, and a genuine one-page test. They also cover retained receipts with unavailable photos, separate marking completion, absent delivery, two numbered books, repeated confirmation record time, effective delivery correction, unchanged/resolving retakes, another child's scans, invalid event admission, and zero-scan book 2 HOLD.

Clock tests assert actual public deadlines just before and at four local days. They cover seasonal changes, a forward gap, a repeated clock hour, Vancouver and Edmonton dated overrides, a non-overridden Chicago zone object, and an explicit resolved family zone. The backstop tests assert just before and at the delivery deadline.

- Scan progress: proves deterministic projection over supplied durable records. It does not prove receipt admission or database persistence.
- Marking: proves separate public states through `HistoryPage`, `historyPage`, and `completedPage`, including unavailable photos. It does not run marking jobs or the canonical hosted reader.
- Delivery: proves the projection uses each book's effective `DeliveryReceipt` and `deliveryDeadlines`. It does not prove confirmation reloads, authorization, or concurrent confirmations in the store.
- Inactivity: proves candidate selection and local-calendar boundaries. It does not create reminder episodes, claim messages, or cancel a dispatch.

## Conservative choices and adapter requirements

The store adapter must read the immutable published manifest and page-ID mapping from the same workbook revision. The manifest is authority for its complete required set. This core cannot detect omitted printed content when a supposedly frozen manifest itself is false.

The adapter must establish ownership, correct page identity, quality/calibration, and durable normalized-photo save before it supplies an accepted receipt. Photo presence, S1 attachment, `sent_at`, highest day, marking completion, and analytics consent do not establish acceptance. Photo deletion or expiry does not remove an admitted receipt. This core reads no image lifecycle state and cannot restore an image.

The adapter must establish that a resolving retake event is genuine. It must preserve finalized original results and parent changes. The item IDs in the event are references, not proof of those facts. The pure core does not infer mistake causes or missing tested steps.

The adapter supplies exactly one effective delivery receipt per book. Authorized corrections use the effective `deliveredAt`. Confirmation retry record times are ignored. The inactivity anchor cannot precede confirmed delivery, even when scans arrived earlier.

The phrase "latest confirmed-delivered unfinished book" can conflict with the rule that older books stop reminders after a newer delivery. The core makes the conservative choice: select the highest numbered confirmed-delivered book first. If it is complete, return no candidate. Do not revive an older book's reminder. Root must review this policy choice before store integration. Duplicate workbook IDs or numbers refuse reminder selection. Invalid same-child delivery data also refuses selection.

A resolving retake's anchor uses its accepted scan time, even if its progress event arrives later. Delivery-only anchors retain the delivery receipt's recorded zone. Later scan anchors use the current passed family zone. Root must retain these explicit time rules or settle any different policy before integration.

The core has no analytics, unsubscribe, billing, free-month, or restart input. Existing seven-day first-free-month reminders, immediate paid Restart with no second free month/reminder, and #684 Ready/Hand/Courier behavior remain outside this change. No new decision number was created.

## Root-owned work

Root retains all of the following:

- Production durable receipt admission and its authoritative store adapter.
- Concurrent trigger/store claims, uniqueness, race checks, and restart/recovery proof.
- S8/store/UI integration through `scanHistoryStore` and `readScanHistoryNow` where applicable.
- Day 7/backstop arbitration, evidence capture, snapshot bounds, and later-book consumption.
- Inactivity email episodes, reservations, parent aggregation, unsubscribe, eligibility, and dispatch checks.
- Hosted RLS, photo deletion/expiry fences, and family deletion proof.
- The full test/lint/build/browser gate and independent review.
- Push, pull request, and merge.

No shared transport, email, dashboard, generator, print, package, template, plan, quality, migration, or existing source file changed. No paid API/model call, customer Prepare run, live family change, browser check, generation, or physical sample ran.

The approved work order remains #475, #472, #473, #476 with printed pages unchanged. The full U16 approval sample remains pinned to `99f0e00e`. It still needs Savar's relayed approval. This local core grants no customer-run authority.

HANDOFF_READY remains pending root integration. Root can change the marker after it consumes this handoff.

## Root correction before independent review

The initial core excluded every page outside the required day manifest from accepted receipts. Two added public tests reproduced the loss of a scored Extra practice scan and a false zero-scan backstop hold. The correction accepts question-bearing pages apart from covers, plan pages, back covers and padding. Required day sets still come only from the frozen manifest. All 31 public tests pass. This changes no printed page. The initial fixture's empty Extra practice page remains excluded.
