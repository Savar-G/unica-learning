FAIL - Spec review. One reproduced P2 defect remains. This review gives no merge or release approval.

Computer: Savars-MacBook-Pro-5.local. No child agent was used.
Source: /Users/savargupta/.t3/worktrees/pagewise-landing-page/site-pd-plan-controls.
Physical source: /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/site-pd-plan-controls.
Branch: site/pd-plan-controls.
Head: 581afa22d822092fa4a27546302e8adeadf14364.
Base: 89ecf73965eccbf0f59e49401b69cf09a4e12579.
Branch, HEAD and clean status were verified before and after the checks. No repository file or cache was written. The source stayed pinned.

P2: A Cancel request that returns no_plan still stops initial work and the first free month.

Location: src/lib/parent-plan-server.ts:90. The unconditional finishControl(...,"applied") follows cancelPlan's {ok:false,error:"no_plan"} result. The SQL applied branch at supabase/migrations/20261105234500_plan_controls.sql:151-154 sets cancelled=true. The API at src/app/api/account/plan/cancel/route.ts then returns HTTP 409 for no_plan.

Likelihood: low. A direct authenticated request for an owned saved-card row before the initial subscription starts reaches this path. The ordinary not_started UI does not offer Cancel. No foreign ownership, forged provider response or provider failure is needed. This is a deterministic server-interface failure, not a claim about ordinary button use.

Contract: the written original P2 finding requires cancellation to "block only intended future work" and avoid "permanent wrong state after provider refusal". The accepted implementation contract states: "Initial start: first delivered book and no earlier subscription. One first free month only." The operating notes state: "A refused resolution removes the operation hold and preserves that prior state." A no_plan result reports that no cancellation occurred. It must not change an initial, uncancelled child to permanently cancelled.

Sequence: create an owned saved-card row and a delivered first workbook, with no provider subscription and no successful local start. Invoke the exported cancelFamilyPlan with a fake Stripe SDK transport that returns a complete empty subscription list. No provider write occurs. The function returns no_plan, but the real SQL closes its operation as applied and sets cancelled=true. Public start_workbook_run then raises plan_cancelled. Public admit_plan_start raises restart_required. Paid Restart also requires an earlier ended provider subscription, so it cannot restore this initial case. The record needs a team correction.

Observed output:
NO_PLAN_CANCEL {"result":{"ok":false,"error":"no_plan"},"cancelled":true,"blocked":false,"prepare":"plan_cancelled","initial":"restart_required"}

The same independent test first proves that preparation and initial admission succeed for an equivalent untouched family. Its fixed-state assertion then fails on cancelled=true. Evidence: /tmp/pd662-spec-581afa22-independent.test.ts and /tmp/pd662-spec-581afa22-independent.log. The result reproduced twice; counts below use only the final log.

Smallest fix: resolve the admitted control as applied only when result.ok is true. Resolve a definite no_plan result as refused, preserving the prior cancelled state and releasing the closed operation's hold. Keep thrown or uncertain results open. Add this case through cancelFamilyPlan with the actual SQL seam.

The six written findings were checked from the original report:

| Finding | Independent fixed-source result | Evidence |
| --- | --- | --- |
| S1 old initial caller obtains a paid key or second trial | Pass. The unchanged base startPlan is refused before a create. A valid initial retry still retains its trial and key. | repairs.log and public.log |
| P1 outstanding prepared target can be skipped | Pass. Public preparation and shipment cannot skip target 2 via book 3. Both Pause/prepare and Pause/shipment lock orders pass. Fulfillment consumes the mailing obligation once and retains allowance use. | repairs.log |
| P2 refused Cancel corrupts prior confirmed state | The written SQL refusal cases pass for active and already-cancelled states. The additional public no_plan case above fails. | repairs.log and independent.log |
| P3 old-plan pause affects paid Restart | Pass. The dated eight-week case retires the old mailing effect. Public charge/mailing reads ignore it. The eight used weeks remain. | repairs.log and public.log |
| P4 refused paid Restart retains route hold | Pass. Durable refusal releases the hold. Unknown outcome and failed refusal save retain it. Late matching success closes it. | public.log |
| P5 Cancel date equals delayed charge date | Pass. customerPlan and cancelPlan agree on 1 January. The next charge remains 15 January. | public.log |

Additional Spec checks passed: owner and service grants; deletion fences; stale book, receipt, location and year; concurrent duplicate and different controls; exact eight-week reservation; sibling isolation; matching-key recovery under a family fence; 24 SQL/TypeScript local-day comparisons and six calendar-week shifts. The independent boundary matrix adds 12 successful admission cases: shipping day nine and day ten across six zones. Pending public Pause replay performs two recovery reads, zero sends and retains its hold. Paid Restart creates exactly one durable request; an existing run leaves it unconsumed, and a new public preparation links it to the new run.

The issue #559 body, issue #546 body, accepted implementation contract, AGENTS.md, DESIGN.md, issue tracker guide, plan-controls notes, parent-dashboard notes, original findings, repair report and root verification report were consulted. The later reminder decision controls: retain the seven-day reminder before the first free month ends; charge paid Restart immediately with no second trial, new reminder or delay. The reviewed source keeps these rules. Classic paid Pause remains an explicit safe refusal with a support action. This is a documented release limit. No mark correction or history scope was added. Source access checks stay in place; deployed switches were not queried.

Commands and local fixture:

```sh
rg -n 'HANDOFF_PD662_SPEC_581AFA22' /tmp/pd662-review-spec.md
cat /tmp/pd662-review-spec.md /tmp/pd662-review-common.md
git branch --show-current
git rev-parse HEAD
git status --porcelain
git diff --stat 89ecf73965eccbf0f59e49401b69cf09a4e12579...581afa22d822092fa4a27546302e8adeadf14364
pg_isready -h /tmp/pd559-postgres -p 55559
lsof -n -U | rg '/tmp/pd559-postgres/'
initdb -D /tmp/pd662-spec-581afa22-pgdata -A trust > /tmp/pd662-spec-581afa22-init.log
pg_ctl -D /tmp/pd662-spec-581afa22-pgdata -l /tmp/pd662-spec-581afa22-server.log -o '-k /tmp/pd559-postgres -p 55559 -c listen_addresses=' start
createdb -h /tmp/pd559-postgres -p 55559 pd559_spec_final
PD559_SOCKET=/tmp/pd559-postgres PD559_DATABASE=pd559_spec_final node /tmp/pd662-spec-581afa22-plan_controls.cjs --bootstrap > /tmp/pd662-spec-581afa22-baseline.log 2>&1
PD559_SOCKET=/tmp/pd559-postgres PD559_DATABASE=pd559_spec_final node /tmp/pd662-spec-581afa22-plan_controls_repairs.cjs > /tmp/pd662-spec-581afa22-repairs.log 2>&1
PD559_SOCKET=/tmp/pd559-postgres PD559_DATABASE=pd559_spec_final node /tmp/pd662-spec-581afa22-plan_controls_public.mjs > /tmp/pd662-spec-581afa22-public.log 2>&1
PD559_SOCKET=/tmp/pd559-postgres PD559_DATABASE=pd559_spec_final node node_modules/vitest/vitest.mjs run --config /tmp/pd662-spec-581afa22-independent.config.mjs --configLoader runner --no-cache --maxWorkers 1 --reporter verbose > /tmp/pd662-spec-581afa22-independent.log 2>&1
pg_ctl -D /tmp/pd662-spec-581afa22-pgdata -m fast stop > /tmp/pd662-spec-581afa22-cleanup.log 2>&1
pg_isready -h /tmp/pd559-postgres -p 55559
pgrep -af '^.*postgres -D /tmp/pd662-spec-581afa22-pgdata'
git branch --show-current
git rev-parse HEAD
git status --porcelain
```

Before startup, the assigned socket had no active socket file, no lsof match and no server response. The old files inside that socket directory were not changed or removed. The new server used only this review's new data directory, Unix socket and database. TCP listening was disabled.

Harness changes exist only in copies under the assigned prefix. The repair/public fixture socket changed from /tmp/pd-controls-bf76-pg to /tmp/pd559-postgres and the port from 55629 to 55559. Every old output prefix changed to /tmp/pd662-spec-581afa22. The CJS pg require uses the absolute installed source dependency, since the copied scripts live in /tmp. The public runner reads the copied fixture, uses its new include filename, and keeps its Vitest cache directory under the assigned prefix. No test assertions or production SQL bodies changed. The cached PR656 function is read at exact commit bf59c33ae127c2f45d72e24efbfcd757e4b01778. Its fixture use does not merge that commit.

Falsifiers were written before checks in /tmp/pd662-spec-581afa22-falsifiers.md. The copied harnesses, independent probes and configs remain available under the assigned prefix. Final machine-filtered counts are in /tmp/pd662-spec-581afa22-counts.json:

```json
{
  "baseline_sql_pass": 12,
  "repair_sql_pass": 14,
  "public_test_pass": 9,
  "independent_test_pass": 14,
  "independent_test_fail": 1
}
```

SQL: 26 groups passed. Public TypeScript tests: 23 passed, one failed. These are distinct units. No full-suite or build repeat occurred.

| Subsystem | Independent proof | Passed through or unverified |
| --- | --- | --- |
| Admission and mailing | Production SQL function bodies, synthetic supporting tables, finite concurrent paths, owner/stale/quota checks, target and sibling rules | Full hosted schema, production scheduler and all possible concurrent orders |
| Cancel and Restart | Real exported TypeScript functions with actual local SQL and fake SDK transport; six prior cases; one new no_plan failure | Real provider acceptance, invoice timing, failed resume, card-return behavior, restricted-key settings and cancellation team procedure |
| Dates and recovery | Family-local boundary cases, dated zone comparisons, durable pending holds and matching recovery | Hosted time/runtime and provider event delivery |
| Release and presentation | Source rule inspection; supplied evidence only for root checks | No independent browser, hosted switch, credentials, email or live service check |

Supplied root evidence, not repeated here: 16,403 tests passed, one optional skip, 427 files; lint/build exit 0; hosted migration 20261106010709 and rollback probe with zero residual rows; 29 synthetic browser cases and nine screenshots at 390/820/1440. These results do not remove the reproduced public-interface failure. Provider and family-release limits remain in docs/plan-controls.md. Dashboard and family marking remain off by instruction; this review queried no live configuration.

Cleanup: this review's PostgreSQL server stopped successfully. pg_isready reports no response. No owned server remains. Vitest exited. No other reviewer's process, socket or artifact was used. The handoff marker is changed only after this report and cleanup. No repository, browser, provider, hosted, email, paid or PR action occurred.

PR https://github.com/Savar-G/unica-learning/pull/662, head 581afa22d822092fa4a27546302e8adeadf14364, checks: 26 local SQL groups passed; 23 public tests passed and one failed; reviews: Spec FAIL, Standards assigned separately; no merge or release approval.
