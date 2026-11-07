# Independent workbook scan progress reader review

SPEC APPROVE

STANDARDS APPROVE

VERDICT APPROVE 597c04c1ebc0a6d5a160bef7ee7fba2da1ad1ac8

Approval covers this bounded reader and clock adapter slice. No reproducible in-scope P0, P1, P2, or P3 defect was found. This report does not approve release or complete issue #475.

## Frozen source

- Computer: `Savars-MacBook-Pro-5.local`.
- Review model: Unify Codex `gpt-6.1-sol`, high reasoning effort. No subagent ran.
- Assigned path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-4ad9e5a0`.
- Resolved path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-4ad9e5a0`.
- Branch: `site/workbook-scan-progress-reader-475-mac`.
- HEAD: `597c04c1ebc0a6d5a160bef7ee7fba2da1ad1ac8`.
- Base: `d8ab955d41cc5df27fc8f6acf9cb9a6f8b582e0c`.
- Reviewed diff: `git diff d8ab955d41cc5df27fc8f6acf9cb9a6f8b582e0c 597c04c1ebc0a6d5a160bef7ee7fba2da1ad1ac8`.
- Diff size: 10 files, 1,796 additions, zero deletions.

The initial hostname, resolved directory, branch, clean status, HEAD, and base matched the brief. The base is the merge base. The same branch, clean status, and HEAD were checked again before this report was written. No fetch, merge, branch change, or other checkout action ran.

The review read `AGENTS.md`, `docs/agents/delegate-brief.md`, the supplied issue JSON as data, the receipt review and hosted record, and the progress reader, progress core, receipt, and clock handoffs. It also read the changed source and tests, generated type changes, and relevant public delivery, history, print-contract, and clock interfaces. The older receipt handoff's SQL calendar design is superseded by the clock handoff. The hosted record supersedes its older unapplied-migration statement.

The latest #628 rule controls the old issue text: zero accepted scans at 21 local calendar days after this numbered book's confirmed delivery means HOLD and ask for scans. It permits no automatic advance, repeat, or queue action.

## Falsifiers

Approval would fail if the reader mixed family, child, book, revision, or page identities; exposed private question or photo data; lost or duplicated rows under a server cap; looped on a cursor; returned partial results after an error; retained stale scope after history pagination; used admission time as scan time; let an unchanged retake reset inactivity; treated missing history as ready; or used marking completion to establish acceptance.

Approval would also fail if a current calculation replaced a stored calendar or claim, a later delivery correction rewrote a historical Day 7 claim, a historical null deadline was rejected or invented, clock-required recovery disappeared, or one family fence blocked another book's clock recovery. Type diagnostics, scoped lint errors, and diff whitespace errors would also block approval. These conditions were stated before the relevant checks.

## Spec findings

No concrete defect was found in the agreed slice.

| Contract | Evidence and result |
| --- | --- |
| Checked caller selects scope | Both public server interfaces document the caller's live authorization duty. The adapter checks parent, child, deletion state, shipped book, number, and printed revision. Service credentials and browser facts do not authorize the end user. |
| Minimal progress inputs | Page and question queries select stored identity and page shape. They read no package, answer, profile, photo, or image bytes. The public result omits canonical child names and photo metadata. |
| Complete pagination | The real typed Supabase client with fake fetch retains all 1,205 pages, 1,205 questions, 1,206 receipts, and 1,205 events under a server cap of 137. It checks retained IDs and exact remaining counts. Invalid cursors, changed counts, incomplete answers, and resource limits fail the read. |
| Separate marking state | The canonical public history reader supplies review state. Its 1,205-record case completes in 13 outer pages. Missing history remains unknown. Completed marks establish no accepted scan, Day 7 progress, or qualifying scan time. |
| Retake timing | The adapter joins each resolution event to its exact accepted receipt and page. Tests preserve all accepted retakes. A resolving event uses accepted scan time. An unchanged retake does not reset inactivity. |
| Final scope checks | Existing tests cover changes during store reads. Added checks through the actual adapter cover a delivery correction and child deletion during canonical history. Both return unavailable. |
| Persisted facts | The reader keeps current projection candidates separate from stored calendars, claims, and HOLD. Tests deliberately use different stored and current deadlines. A historical Day 7 claim retains its null deadline after a correction. Its optional calendar is read by the claim's original audit. |
| Clock recovery | The typed adapter uses the saved audit, instant, zone, and override flag. It rejects malformed replies and unrelated tested error codes. A 55000 fence causes individual retries after the bulk rollback. Added checks combine that fallback with a stale write and confirm that the fresh request supplies the next write's identity and canonical deadline. |
| HOLD and pending recovery | Zero scans produce HOLD without a claim. Missing calendars remain visible as clock-required, including a delivery with no pre-migration request. This reader creates no calendar, claim, queue, or reminder. |

## Standards findings

No reproducible documented-standard violation was found in scope. Tests call public module interfaces. Store tests use the actual typed Supabase client with fake fetch. The implementation uses the canonical delivery and family-time helpers and the existing canonical history completion interface. It adds no private marking policy, query type override, schema cast, or generated-type hand edit.

The generated type diff contains only additions for the reviewed scan tables and functions. It preserves nullable claim `backstop_at`. Generation and hosted application are supported by root's saved record, not by a new service action in this review.

No smell-only concern is treated as a rejection finding. Deferred root integration does not breach this bounded task's standards.

## Checks run

1. Six focused files with `--maxWorkers=1`: PASS, 144 tests. Files: `workbook-scan-progress-reader.test.ts`, `workbook-scan-progress-store.test.ts`, `workbook-scan-clock-store.test.ts`, `workbook-scan-clock.test.ts`, `workbook-scan-progress.test.ts`, and `workbook-delivery.test.ts`.
2. Six added public-interface groups: PASS, `INDEPENDENT_SCAN_READER_ADAPTER_OK 6`. They test correction and deletion during history, later receipt and event request failures, later history failure plus private-field exclusion, and combined bulk-fence/stale-clock recovery.
3. Scoped TypeScript: PASS, ten root files and their imports, `SCOPED_TYPESCRIPT_DIAGNOSTICS 0`. The roots are the reader, progress store, clock store, clock core, and progress core, each with its test file. The program uses repository compiler options with `noEmit: true`, `incremental: false`, and no Next plugin.
4. Scoped ESLint on those ten files: PASS, exit 0.
5. `git diff --check` on the exact reviewed range: PASS.

The added groups ran from an in-memory bundle. They reused the existing synthetic HTTP fixture and called public implementation interfaces. No temporary source or test file was written. The first independent harness attempt stopped before any checks because its module loader received an undefined filename. The corrected in-memory loader completed all six groups. This was a harness error, not an implementation failure. No base-red result is claimed because the new reader and adapter do not exist at the base.

Runtime: Node 22.23.1, ICU 78.2, time-zone data 2026a.

## Compatibility and proof limits

The local `origin/main` reference resolves to `8491309de57f9e91c37c73699e7c9626fad17fd7`. Marking commit `cfab81916a5e81d075f355c3f6c54cca646b6000` is its ancestor. No remote refresh ran. Read-only source comparison found no changed history, print-contract, family-time, or database wrapper interface used here. Main adds stricter correction identity checks in the delivery store. The candidate narrows the delivery deadline helper's required input fields without changing its calculation. No merge was attempted. This is source compatibility evidence, not a combined build or runtime result.

- Scope and pagination: memory and fake HTTP checks prove explicit filters, retained rows, cursor refusal, and final checks. They do not prove hosted authorization or one database transaction across HTTP requests.
- Receipt and retake admission: tests prove mapping and projection of durable facts. They pass through the previously approved SQL admission contract. They do not run photo quality checks, durable byte saves, or hosted marking publication.
- Marking history: tests prove separate canonical review state and output field exclusion. They pass through the existing public completion rule. They do not prove recognition accuracy or profile updates.
- Delivery and clock: checks prove saved identity mapping, canonical local calculation, response validation, and bounded recovery behavior. Stored historical facts remain separate. No hosted RPC or production runtime ran.
- Generated schema and hosted record: source review confirms their correspondence. The saved record reports live migration `20261106213840`. This review does not independently repeat hosted catalog, role, deletion, or Storage checks.

Root retains scheduler and delivery callbacks, due-book and historical-delivery recovery, inactivity episodes, email and UI, parent-summary route authorization, hosted role and deletion tests, current-main integration, the full gate, and release. Those planned steps are not new findings in this slice.

No full suite, build, Chromium, browser, generator, model/provider call, service connection, credential read, migration, type generation, customer content/profile/comment read, customer action, push, PR, merge, watch, or GitHub comment ran. The customer book remains frozen and has no print approval. All owned check processes stopped. Only this report was written.

HANDOFF_DONE

SPEC APPROVE

STANDARDS APPROVE

VERDICT APPROVE 597c04c1ebc0a6d5a160bef7ee7fba2da1ad1ac8
