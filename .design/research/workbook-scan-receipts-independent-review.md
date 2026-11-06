# Independent workbook scan receipt review

SPEC APPROVE

STANDARDS APPROVE

VERDICT APPROVE d8ab955d41cc5df27fc8f6acf9cb9a6f8b582e0c

Approval applies only to the bounded database/core slice. It does not approve the release or complete issue #475. No concrete in-scope P0, P1, P2, or P3 finding remains.

## Source and authority

- Computer: `Savars-MacBook-Pro-5.local`.
- Review runtime: Codex `gpt-6.1-sol`, high reasoning effort. No subagent was started.
- Source path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-b62d245e`.
- Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-b62d245e`.
- Branch: `site/workbook-scan-receipts-475`.
- Frozen HEAD: `d8ab955d41cc5df27fc8f6acf9cb9a6f8b582e0c`.
- Base: `de9404ee545517387a241d79f19f1d70ab1e3201`.
- Diff: `git diff de9404ee545517387a241d79f19f1d70ab1e3201...d8ab955d41cc5df27fc8f6acf9cb9a6f8b582e0c`.
- Exact scope, checked again before this report: 11 files, 2353 insertions, 1 deletion.

The initial hostname, physical working directory, branch, clean status, HEAD, base, and diff matched the brief. The final pre-report check matched them again. No branch change, checkout creation, fetch, merge, or implementation edit occurred.

The review read `AGENTS.md`, `docs/agents/delegate-brief.md`, all three scan handoffs, the saved #475 issue JSON, the candidate source/tests, and the relevant production scan, marking, delivery, print-contract, family-time, and deletion code. The supplied latest #628 rule overrides the saved issue's old zero-scan rule: zero accepted scans at 21 local calendar days means HOLD and ask for scans. It permits no automatic advance, repeat, or claim.

## Falsifiers stated before checks

Reject the slice if a rejected or unsaved photo creates progress; a stale calibration, wrong printed identity, pre-install photo, or missing durable object creates a receipt; callback retries move acceptance; image removal erases an accepted fact; expiry during a lock wait permits admission; an incomplete Day 7 set claims; missing delivery claims; zero-scan HOLD consumes a claim; concurrent paths lose or duplicate a claim; a stale delivery calendar creates a decision; a retake replaces a finalized original or parent change; or an unapproved role can write these facts.

The clock check must compare persisted deadlines with the actual public `deliveryDeadlines` and `family-time` outputs. A copied calendar algorithm or aggregate test count alone cannot prove the contract.

## Findings

### Spec

No concrete defect found in the agreed slice. The receipt, clock, projection, and claim interfaces can support the planned root integration.

| Contract | Evidence and result |
| --- | --- |
| Acceptance requires saved bytes and current calibration/sheet check | Both save/ready orders pass through production RPCs. Refused states, stale checks, missing source/derived objects, wrong scope/revision, absent contracts, excluded pages, and pre-install photos create no receipt. |
| Lifecycle uses database time after waits | The supplied transaction-clock test passes. An additional real book-gate wait crosses photo expiry. The unchanged save RPC returns `saved`, but the new hook creates zero receipts and zero claims. |
| Receipts survive image removal | Expiry and hard photo-row deletion preserve receipt rows. The pure projection retains accepted progress independently of photo availability or marking completion. |
| Ordinary/test Day 7 requires its full frozen set | Partial sets and early Days 8/10 do not qualify. Full ordinary and test sets qualify with earlier gaps. A genuine one-page test qualifies. Question-bearing Extra practice is accepted without entering a required day set. |
| Delivery and one claim per numbered book | Receipt-before-delivery, repeated confirmation, two numbered books, delivery corrections, final-scan races, and Day 7/backstop arbitration pass. HOLD stores no trigger claim. Later accepted work can qualify. |
| Canonical calendar and durable recovery | Twenty binding cases use the real helper, including both override modes, dated overrides, gap/fold behavior, and minute boundaries. Service writes reject stale audit/instant/zone/override identities and conflicting saved calendars. Missing calendars remain durable requests. Day 7 can claim immediately with null `backstop_at`. |
| Calendar time after lock waits | The real minute test begins before `2026-11-06T21:33:00.000Z`, waits at the book gate, then records a HOLD after the deadline. It creates no claim. Three-session calendar/final-receipt/reconcile races pass in both orders. |
| Recovery remains bounded | SQL returns only current missing requests, excludes stale correction audits and family/child deletion state, and enforces the read limit. The public pure recovery function bounds its pass and one stale refresh, preserves lost-response recovery, and reports conflicts. |
| Retakes resolve genuine pending evidence | Production S4/S5 transitions use the prior owner/version and matching evidence identity. Unchanged retakes, expected/mastery/teaching changes, first-photo completion, finalized originals, and parent judgments on earlier evidence create no resolution event. Parent/publication races preserve the winning result. |
| Access and deletion | Local roles exercise RLS and RPC denial. The new tables deny direct writes to anon, authenticated, and service roles. Checked admin/service paths succeed. Family/child fences and identity cascades cover the new facts. |

### Standards

No reproducible documented-standard violation found in scope. TypeScript tests use public module interfaces. The projection has no database, network, model, or implicit clock dependency. The calendar recovery function calls the existing canonical helper. The migration is additive. New privileged helpers have empty search paths and restricted execute grants. A PostgreSQL catalog comparison confirms that every pre-existing loaded public function definition and ACL remains unchanged.

No smell-only heuristic is reported as a defect. The explicit task boundary controls the deferred migration, generated types, full gate, and browser work.

## Checks run in this review

1. `npx vitest run src/lib/workbook-scan-clock.test.ts src/lib/workbook-scan-progress.test.ts src/lib/workbook-delivery.test.ts --maxWorkers=1`: PASS, 3 files, 55 tests.
2. `node supabase/tests/workbook_scan_receipts.cjs`: PASS, `WORKBOOK_SCAN_RECEIPTS_OK 34`. Actual PostgreSQL 18.6 processes and concurrent sessions ran on a private Unix socket. The runner stopped its server and removed `/tmp/unica475-pg-UAZcnq`.
3. A temporary independent runner reused the production fixture/bootstrap and public RPC helpers. It skipped the original groups and ran five added groups. Final result: `INDEPENDENT_WORKBOOK_SCAN_OK 5`.
4. `npx eslint src/lib/workbook-scan-clock.ts src/lib/workbook-scan-clock.test.ts src/lib/workbook-scan-progress.ts src/lib/workbook-scan-progress.test.ts src/lib/workbook-delivery.ts`: PASS, exit 0.
5. `git diff --check de9404ee545517387a241d79f19f1d70ab1e3201...d8ab955d41cc5df27fc8f6acf9cb9a6f8b582e0c`: PASS.

The five added PostgreSQL groups checked:

- Photo expiry during an actual book-lock wait.
- S5 resolution of retained retake evidence after terminal photo deletion, with receipt preservation and no photo restoration.
- Delivery correction after a Day 7 claim with null calendar, including permanent preservation of that claim and refusal of the obsolete calendar response.
- Cross-book audit substitution with otherwise matching clock values, plus cutover exclusion followed by a valid new photo.
- The current-main two-ways policy, acceptance, and S5 owner/version behavior.

One temporary-fixture run failed because it created a second active photo for the same page. PostgreSQL correctly enforced `scan_one_active_page`. The fixture was corrected to delete the first photo before the second admission. The final five groups passed. An earlier asynchronous launch did not retain its complete output and was not counted as a pass. All runner clusters were removed. The temporary script was removed. The final process check found no owned test server or runner. No base-red test result is claimed; the new modules/schema do not exist at the base.

## Current-main compatibility

Read-only `git show` and the diff against `cfab81916a5e81d075f355c3f6c54cca646b6000` confirmed that the new marking slice retains the `owner_photo`, observation state/evidence, and `result_version` contracts used by this hook. Its two-ways migration changes expected policy through a BEFORE trigger. The candidate AFTER hook refuses progress when that expected policy changes.

The added local group loaded the exact two-ways policy SQL with `git show`. It verified that acceptance remains valid, the policy requires parent review, and S5 clears `owner_photo` while incrementing the result version. No merge or checkout change occurred. This checks the shared SQL contracts. It does not prove the complete combined application after root integrates current main.

## What each subsystem proves and passes through

- Progress core: proves deterministic required sets, gaps, accepted-page projection, separate review state, per-book deadlines, inactivity anchors, resolving-event references, and zero-scan HOLD over supplied records. It passes through the adapter's durable admission and immutable manifest truth.
- Receipt database: proves production RPC/hook admission, cutover, database-clock expiry, idempotency, and durable local rows. It passes through synthetic Storage metadata and ready quality/calibration results. It does not decode image bytes or prove hosted Storage behavior.
- Marking: proves production S4/S5 version/owner transitions, resolution-event admission, parent corrections, and result preservation under local races. It passes through synthetic readings. It does not call a model, publish learning events, or rebuild profiles.
- Claims: proves actual PostgreSQL lock order, both delivery orders, correction races, numbered-book uniqueness, full frozen sets, and HOLD without claim consumption. It passes through reduced dependency tables and upstream published-print truth.
- Calendar/recovery: proves the actual public family-time helper supplies the persisted deadline, SQL compares current identity after waits, and the pure recovery function preserves bounded retries and conflicts. It passes through the trusted service computation. It does not run a deployed typed adapter or scheduler.
- Access/deletion: proves local effective role permissions, RLS, family/child fences, and FK cascades. It passes through reduced Auth/deletion dependencies. It does not prove hosted role defaults, the complete deletion worker, or platform behavior.

## Root-owned proof and release limits

The migration remains UNAPPLIED. Approval does not include hosted PostgreSQL 17 compatibility, hosted migration probes, generated database types, typed Supabase adapters, actual API/server/scheduler integration, legacy-delivery seeding, inactivity episodes, email aggregation/dispatch/unsubscribe, UI, S12 snapshot preparation/consumption, or the full release gate. These are planned root steps, not new in-scope defects.

Root must preserve durable `clock-required` recovery, nullable historical Day 7 claim calendars, the service-only canonical clock boundary, and the latest zero-scan HOLD policy. Root must integrate current main and perform the combined checks before release.

No full suite, build, browser, Chromium, generation, model/provider request, paid API, hosted service, credential read, migration application, type generation, customer action, push, PR, merge, comment, or watch occurred. The private first customer book was not read or edited. This review grants no print approval.

HANDOFF_DONE

SPEC APPROVE

STANDARDS APPROVE

VERDICT APPROVE d8ab955d41cc5df27fc8f6acf9cb9a6f8b582e0c
