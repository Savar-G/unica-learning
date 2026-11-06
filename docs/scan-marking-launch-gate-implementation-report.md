# Scan marking launch check implementation (#542)

IMPLEMENT_DONE_MARKING_LAUNCH_GATE

Implementation is complete for this slice. Family marking remains held. This is not release approval. Keep #542 and #458 open.

## Source and location

- Machine: Savar's MacBook Pro (4). The PC was not used because exclusive checkout ownership was unverified.
- Requested model: Unify Codex `gpt-6.1-sol`, high reasoning. No subagents were used.
- Worktree: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-3a6bf2f4`.
- Resolved path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-3a6bf2f4`.
- Branch: `t3/scan-marking-launch-gate`.
- Source pin: `8491309de57f9e91c37c73699e7c9626fad17fd7`.
- The checkout was clean. Fresh `git fetch origin main` returned this pin. Only this prepared checkout was fast-forwarded to it.
- Fresh GitHub reads: issue #542, its comments and spec #368 on `Savar-G/unica-learning`.
- Decision sources: D-267 and D-293. No decision number was added.

## Changed paths

- `src/lib/scan-marking-launch.ts`: small pure check, typed candidate/evidence and the canonical launch record.
- `src/lib/scan-marking-launch.test.ts`: public-interface tests for complete synthetic proof, missing/malformed/deferred/stale proof, Savar's approvals, chronology, D-267 counts and spending limits.
- `src/lib/scan-marking-server.ts`: one source-controlled readiness read for dispatch and recovery. Only the existing exact `test-only` mode remains supported.
- `src/lib/scan-marking-server.test.ts`: fake-HTTP admission, concurrent direct/recovery refusal, expired-photo history and parent-change recovery tests.
- `docs/scan-pages.md`: one checklist description with owner, required proof, status and release limits for each canonical record item.
- `docs/scan-marking-launch-gate-implementation-report.md`: this report.

## Readiness and counts

The canonical record has 10 items: 8 pending and 2 deferred. Provider policy and privacy text remain explicitly **deferred by Savar**. No approval was invented. The record has no approved candidate, evaluation run or verified limit proof. D-267 itself remains decided; a candidate-bound paid-run record is missing.

The pure check returns `ready: false` and 15 named blockers:

`candidate-missing-or-stale`, `sample-approval`, `screen-approval`, `evaluation-bar`, `evaluation-pass`, `provider-policy`, `dedicated-key-limit`, `physical-iphone`, `physical-android`, `privacy-text`, `release-flags`, `evaluation-bar-or-order`, `evaluation-proof-order`, `evaluation-result`, `spending-limits`.

The server adds `family-release-held`, for 16 blockers. It always reports `familyReady: false`. There is no family `on` mode. Completing evidence does not automatically change release flags or SQL admission. Test/Admin access does not establish family approval. The pure check compares an explicit current candidate with the evidence. The server can compare the current model/prompt, but it does not select a live family's workbook/photo-set candidate or implement family admission.

D-267 remains at most 1% wrong definite marks, zero wrong answers marked right, and at most 5% clear-photo unsure answers. Unsure answers need a plain reason. The proof must retain the USD 50 shared UTC-month cap, the USD 50 TOTAL outside key limit with no reset, and the USD 15 comparison projection stop.

## Verification

Before testing, the falsifiers were: a Scan pages flag or browser claim grants marking; deferred privacy passes; changed model/prompt/photos/revision proof passes; ordinary-family dispatch or recovery enters automatic work; expired-photo history or parent changes acquire a new launch gate. The final added falsifiers were a replacement for Savar's required approval and pass proof recorded before run completion.

- Focused Vitest: **4 files, 85 tests passed**, exit 0.
- Focused TypeScript: **passed**, exit 0. The ignored local tsconfig includes the four changed TypeScript files and their imported dependencies. It excludes unrelated route/test roots.
- Focused ESLint: **4 changed TypeScript files passed**, exit 0.
- `git diff --check`: passed.
- Dependencies were absent. `npm ci --ignore-scripts --no-audit --no-fund` installed this checkout's locked packages. It did not change tracked dependency files.

Test command: `npx vitest run src/lib/scan-marking-launch.test.ts src/lib/scan-marking-server.test.ts src/lib/scan-pages-access.test.ts 'src/app/api/account/scans/[id]/marking/route.test.ts'`.

Evidence validation: proved rejection of the named synthetic unsafe cases and acceptance of a fully populated synthetic record at the exact thresholds. It did not verify that a cited approval or provider report exists.

Server admission: proved that ordinary-family direct dispatch and recovery, run concurrently, stop before photo/model work. It also proved live test/Admin lookup checks and refusal after removal. Allowed test-family processing stopped at a missing-photo terminal result; it did not exercise a successful paid dispatch.

History and corrections: proved server reads and parent changes after photo expiry while automatic marking is off. The real store reader/command/publish paths used fake HTTP. Profile rebuild used a public-function simulation, including interruption and `recoveryPending`. It did not prove hosted SQL, event publication or profile reconstruction. Public GET/PATCH routes retain their pre-existing `markingAccess` checks; no new route access while off is claimed.

Local logs and proposed artifacts remain only in this worktree's ignored `.workbook-sample/scan-marking-launch-gate/`: `focused-tests.log`, `types.log`, `lint.log`, `tsconfig.json` and `readiness.json`.

## Remaining work and proof limits

Root owns full gate, independent review, integration and platform work. No full test suite, Next build, browser, Chromium, hosted write, secret read, paid call, push, PR or merge ran. No flag, key, production price, instruction, database, customer record, print, template, package, plan or curriculum was changed. Other worktrees and the external root artifact folder were not changed.

Comparison candidate `48b46dc1` was not imported or cherry-picked. Its implementation/report paths are identified in `docs/scan-pages.md`, with review and paid proof pending. This source still uses the earlier marking AI client. Root must integrate and verify the dedicated key candidate separately. Root's reported key installation and hosted budget migration were not independently verified here. The price-refresh migration remains pending review and unapplied in the supplied handoff.

Applicable shared first-book sample/screen acceptance, provider/retention choice, privacy completion, counted paid pass, outside key limit and physical iPhone Safari/Android Chrome acceptance remain launch work. Preserve recorded approvals, including the r454 S1 look approval. Do not reimpose the superseded all-level sample requirement. Real child photos remain blocked until Savar sees a passing host policy and chooses. Synthetic comparison comes first; physical phone photos come later. The ready Robin PDF is not physical or recognition proof. The actual customer book remained read-only. Team review of book 1 marks remains daily. First-shipment Maya remains chat only, with voice paused.

## Existing proof clarification

The follow-up changes only evidence text in the canonical record, `docs/scan-pages.md` and this report. No gate logic, feature, flag or approval status changes. #458 remains open for applicable shared launch acceptance, not duplicate S5 code. Older pd458 paid-stop/ownership text is superseded by the latest user authorization.

Read the committed r458 root verification, final independent review, manifest, scenarios and local verification. Root's supplied evidence establishes separate local/public-interface, hosted rollback, real hosted-session local-browser correction and family-deletion worker proof. It covers no pending default, all six result transitions, expiry corrections, stale 409/version handling and retained answer/history. The S5 worker fixture had no Storage objects. That fact limits that fixture, not all inherited proof.

Also read `.design/experiments/r455/hosted-security.json` and `hosted-family-deletion.json`, plus `.design/experiments/r454/hosted-security.json`, `hosted-expiry.json` and `hosted-signout.json`. The checklist now links each record. These inherited hosted tests cover owner/Admin/anonymous download and single/batch signed-URL denial with objects present, authenticated image routes, other-family refusal, terminal deletion and clock expiry before cleanup, late-write/finish/retry refusal, concurrent POSTs, and actual `retention_worker` removal of 39 images with calibration/photo cascades. Sign-out cookie replay returned 401 while the object still existed. Do not add a new Storage blocker because S5 did not repeat those tests.

The r454 artifact history last changed at `13cf268230730cbfdeb71aa69a0a40496051d489`; r455 last changed at `a74cd78ff0082e7859a1b5bce91768c5a65a6388`. These are source provenance references. No hosted check was repeated on this head or the current deployment. The inherited fixture limits are real handwriting, camera capture and curled pages. Remaining shared gates are real-phone booklet/calibration/recognition and uncertain-reading acceptance, model selection/evaluation, provider/privacy and applicable recorded approvals.

The r458 manifest's root-browser pending text is stale relative to root's browser records. It establishes no human approval and creates no new human approval demand. Preserve the r454 manifest's recorded S1 look approval. Provider privacy remains **deferred by Savar**. Real child photos remain blocked until host-policy choice.

Follow-up checks: 52 launch tests passed; focused launch-module lint passed; the readiness probe retained 8 pending items, 2 deferred items and 15 evidence blockers. The server's separate `family-release-held` remains. No new hosted, browser or paid check ran. The earlier 85-test implementation result remains a separate check, not a repeated full result.
