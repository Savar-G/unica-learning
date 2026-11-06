# Six Pause and paid Restart repairs

All six review findings have code fixes and local regression evidence. Hosted acceptance remains with the controlling agent. The dashboard stays off.

## Source

- Computer: `Savars-MacBook-Pro-5.local`.
- Assigned path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-b8ba503b`.
- Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-b8ba503b`.
- Branch: `t3/pd-controls-repair-controls`.
- Exact base and initial HEAD: `bf76e53d66e7950180c45a74f0ce20c209a849b8`.
- Initial status: clean. The external report `/tmp/pd-controls-bf76-repairs-report.md` records the final commit and status.
- One implementation agent performed the work. No checkout, child agent, push, PR, merge, watch, browser, hosted call, real provider call, credential read, email or paid call was used.
- The local ignored `node_modules` link reads the existing dependency installation. It does not change the original implementation worktree. All tested application source and candidate SQL come from this assigned worktree.

## Written finding list and evidence

The unchanged base reproduced all six failures before the fixes. The original review probes ran against this worktree and a new local socket. The before logs assert the faulty behavior deliberately. Their zero exits prove reproduction, not acceptance.

| Finding | Before, at bf76 | Fixed behavior and regression |
| --- | --- | --- |
| S1, legacy deployment overlap | The unchanged old `startPlan` sent a 30-day trial under an open paid Restart key. | SQL checks purpose before returning an existing generation. The old caller cannot obtain the paid key through initial admission. The public SQL test also proves that a valid old initial retry retains its key and trial. The current provider-history refusal remains in `startPlan`. |
| P1, prepared target bypass | Target 2 was blocked, but public preparation admitted 3 and public shipment marked 3. | Every outstanding target at or below the requested number applies. Preparation, shipment and parent reads share `plan_mailing_obligations`. Public RPC tests block both printed 2 and printed 3. A shipment on the permitted day satisfies its obligation once. The allowance remains used. Both prepare and shipment lock orders run concurrently. |
| P2, refused Cancel | A refused operation closed with `blocked=false,cancelled=true`; preparation still failed. | Admission changes only the confirmation revision. Applied cancellation sets the permanent flag. Refusal preserves the prior confirmed state. Tests cover prior active and prior cancelled states, stale confirmation refusal, and public preparation after an active-plan refusal. |
| P3, historical pause | A valid eight-week late pause, requested 90 days ago, delayed book 3 after paid Restart. The old shifted charge ended 13 days ago. | Applied Cancel and successful paid Restart retire earlier mailing effects with `mailing_retired_at`. Rows remain for allowance history. The dated regression now prepares the new book 3. Public mailing and charge reads ignore the retired effect. The provider-ended case needs no local Cancel row. |
| P4, declined Restart | A confirmed `refused` start retained one route hold. The production deletion check returned `busy`. | `payment_refused` requires a fresh read of the same refused generation. The route releases a confirmed closed hold. The parent sees Update card and must review the price again. Unknown provider results and failed refusal saves retain the open start and hold. A separate late matching success closes the start and releases the hold. |
| P5, cancellation dates | Preview showed 15 January. Release and cancellation ended the plan on 1 January. | Live plan reads retain the actual period end as `cancelAt` and keep the delayed `nextCharge` separately. The public provider functions agree on 1 January. A DOM test opens the real cancellation confirmation and checks that date. |

Before evidence: [public functions](bf76-repairs-before-public.log), [SQL state](bf76-repairs-before-sql.log), [public workbook functions](bf76-repairs-before-workbooks.log).

The new SQL acceptance tests also failed against the unchanged SQL for S1, P1, P2 and the dated P3 case. See `/tmp/pd-controls-bf76-regression-before-sql.log` (exit 1, four failed and three passed at that stage). The public acceptance tests failed for S1, P4 and P5 before those repairs. One added unknown-recovery probe first had a duplicate-hold fixture error. Its adapter was corrected to use the production hold functions; that fixture error is not a product finding.

## Final checks

| Subsystem | Result | What the check proved | Limit |
| --- | --- | --- | --- |
| Focused source tests | 87 tests in 11 files passed, exit 0 | Pause dates, allowance, provider encoding, paid Restart, Cancel, server/route controls, payment correction UI and cancellation confirmation | Fake provider transport and DOM; no browser or real invoice |
| Disposable SQL baseline | 12 groups passed, exit 0 | Quota races, stale facts, early/late cutoff, sibling separation, service grants, deletion holds and initial retries | Reduced supporting schema |
| Production-function SQL repairs | 14 groups passed, exit 0 | Four SQL defects, one-time mailing fulfillment, both prepare/shipment lock orders, both PR656 admin/Pause lock orders, private reads, prior-state preservation and matching-key family-fence recovery | Bounded synthetic tables and finite interleavings |
| Public TypeScript plus SQL | 9 tests passed, exit 0 | Unchanged old initial caller versus new SQL; definite refusal versus unknown/save failure; deletion readiness; late success; live charge/cancel dates; parent mailing retirement; family time and allowance | Fake Stripe SDK transport; supporting schema is synthetic |
| ESLint | `node node_modules/eslint/bin/eslint.js src`, exit 0 | Source lint | No build or hosted proof |
| Next route type generation | `next typegen`, exit 0 | Local route declarations generated without a build | Not database type generation |
| TypeScript | `tsc --noEmit --incremental false`, exit 2 | Compile attempt with a 4096 MB cap | Exactly 12 missing control-schema diagnostics remain; no clean compile claim |

The public family-time matrix checks 24 SQL/TypeScript days across six locations and four timestamps. It also checks six local calendar-week shifts. The allowance probe rejects a changed delivery correction, the wrong year and excess weeks. It reserves exactly eight weeks.

The SQL suite installs the actual child resolver, child fence, matching-key start fence, queued-family finish function, workbook start, shipment, printed-workbook lock and card-hold functions. It reads the exact cached PR656 migration from commit `bf59c33ae127c2f45d72e24efbfcd757e4b01778`. It does not merge that commit. The old public caller is extracted unchanged from application base `89ecf73965eccbf0f59e49401b69cf09a4e12579`. Its extracted bytes matched the review's old caller before the probe.

The final three SQL/public stages passed in a fresh database, `pd559_repairs_final`, on socket `/tmp/pd-controls-bf76-pg`, port 55629. TCP listening was disabled. The setup and repeat commands are in `docs/plan-controls.md`.

Final logs: [focused tests](bf76-repairs-focused.log), [baseline SQL](bf76-repairs-after-baseline.log), [production SQL](bf76-repairs-after-sql.log), [public SQL tests](bf76-repairs-after-public.log), [exact compile diagnostics](bf76-repairs-typecheck.log). Full working logs use the matching `/tmp/pd-controls-bf76-*` names.

## Remaining compile diagnostics

The generated database types remain untouched. These 12 diagnostics require the candidate control schema and regenerated types:

- `src/app/(product)/admin/children/[id]/page.tsx:22`: two diagnostics for missing `workbook_restart_requests` and its `child_id` filter.
- `src/lib/card-reconcile-server.ts:92`: missing `plan_start_terms`.
- `src/lib/card-reconcile-server.ts:130`: missing `admit_plan_start_terms`.
- `src/lib/parent-plan-server.ts:85`: missing `admit_plan_cancel`.
- `src/lib/parent-plan-server.ts:87` and `:90`: two dependent `data` diagnostics.
- `src/lib/plan-controls-server.ts:42`: missing `plan_control_context`.
- `src/lib/plan-controls-server.ts:64`: missing `plan_control_operation`.
- `src/lib/plan-controls-server.ts:69`: missing `admit_plan_pause`.
- `src/lib/plan-controls-server.ts:87`: missing `finish_plan_control`.
- `src/lib/plan-controls-server.ts:127`: missing `plan_mailing_weeks`.

The first compiler attempt also lacked local Next route and image declarations. `next typegen` resolved those. The recorded final compiler log contains only the 12 schema diagnostics above. No cast, generated-type edit or query override hides them.

## Integration and limits

The corrected candidate migration is `supabase/migrations/20261105234500_plan_controls.sql`. It has not been applied hosted. Its new column and two mailing helpers are private. Only the ownership-filtered mailing read receives a service-role execute grant. The controlling agent must apply this candidate, generate types, run the full done gate, check the browser and obtain a new independent review.

Immediate paid Restart, the lower saved/current price, one first free month, the existing first-free-month reminder, the eight-week family-local-year allowance, the day-nine cutoff, the classic paid Pause refusal and durable unknown-outcome holds remain. No release switch, scan function, scan migration, S4 schema or deployed Send repair changed.

Provider acceptance, invoice timing, restricted-key permissions, test clocks, resume-payment failure and hosted concurrency remain unverified here. The parent release holds in `docs/plan-controls.md` still apply.

The copied original before-SQL probe also regenerated its disposable `/tmp/pd-controls-review-old-caller-fixture.json` output. The fixed review report, review invariants and original source worktree were not changed. The new committed regressions use their own output names.
