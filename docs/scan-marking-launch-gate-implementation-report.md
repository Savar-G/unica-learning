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

Savar's sample/screen approval, provider/retention choice, privacy completion, counted paid pass, outside key limit and physical iPhone Safari/Android Chrome acceptance remain missing. Real child photos remain blocked until Savar sees a passing host policy and chooses. Synthetic comparison comes first; physical phone photos come later. The ready Robin PDF is not physical or recognition proof. The actual customer book remained read-only. Team review of book 1 marks remains daily. First-shipment Maya remains chat only, with voice paused.
