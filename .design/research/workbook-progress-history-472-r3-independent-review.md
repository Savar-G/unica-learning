# Independent F2 recheck, issue 472, round 3

HANDOFF_DONE

SPEC: PASS for F2 and the stated preservation checks.
STANDARDS: PASS for this bounded diff.
F2: RESOLVED. No confirmed finding remains in this recheck.

This result gives no whole-feature, customer, hosted, or release approval.

## Pins and scope

Machine: `Savars-MacBook-Pro-5.local`, verified with `hostname`. Assigned runtime: Codex `gpt-6.1-sol`, high effort. The task specifies the Unify account; no account or credential file was read. The task reports the PC unreachable. No agent or PC task was started.

Checkout: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-470cdf68`.
Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-470cdf68`.
Branch: `site/workbook-progress-history-472`.
Frozen HEAD: `b787dd8982dfdff6bb571b0f83dde1bd81713771`.
Prior: `6b465b419f9fb2dd716e5987938292f99b28d64a`.

Path, branch, HEAD, and clean status were verified before checks. I read the actual AGENTS.md, delegate brief, written R2 findings, updated history handoff, saved issue `overnight-20261107/issue-472.json`, small source/test diff, and relevant core, context, observation, version, preview, and adapter contracts. The explicit task limits replace the full gate and delegation rules.

## SPEC

The falsifiers were: held versions 0/2 pass; selected version checks weaken; valid held right/prior-zero evidence creates a mastery gap; held context checks disappear; unknown corrections produce a plan; manifest equality changes; or approved core/planner behavior changes.

At `src/lib/workbook-progress-history.ts:156-159`, the catalog now reads each frozen question's context version. Any non-null version other than 1 refuses with `invalid-record` before catalog acceptance. This check precedes sample and held selection. It also covers held records for another step. At lines 382-385, held selected-step validation still uses `requiredSample: null`. It therefore supplies no isolated mastery denominator.

Independent public probes loaded current source and the exact prior history module in memory. Both used the current fixture, core, preview, planner, and adapter. An exact string comparison verified that removal of only the catalog gate reconstructs the prior module. No source was replaced on disk.

For both held reasons, right/wrong results, prior zero, and versions 0/1/2: current source refused eight unsupported contexts and accepted four version-1 contexts. Prior source accepted all twelve. Each accepted held case preserved the full baseline public preview, retained the held item, excluded it from selected decision items, and kept prior mastery zero. Raw reading and public composition agreed. This proves the gate is binding.

Selected versions 0/2 refused on both pins; version 1 succeeded. Other-step held contexts refused versions 0/2 for both reasons and accepted version 1. Six malformed held reading/observation/curriculum cases refused. Four held blank cases preserved prior zero/one. A real selected passing sample with prior zero still refused.

F1 preservation: unavailable corrections retained facts but refused a plan. Complete-empty and fixed proofs succeeded. A valid fix reduced misses from two to one without changing first accuracy, 8/10. Three correction-version boundary probes preserved old-version admission before a parent change, refusal at that change, and new-version admission at the change.

F3 preservation: the real installed client used synthetic GET/HEAD responses only. Recursive object-key reversal preserved the entire preview and adapter fence. Reversed day/page arrays and a changed nested value refused. The fence independently rejected all three unequal manifests.

## Checks and evidence

Fresh checks used only the permitted `t3-e10c57ae/node_modules`: Node 22.23.1, Vitest 4.1.11, TypeScript 5.9.3, ESLint 9.39.5, esbuild 0.28.2, client 2.117.2. Explicit own-source aliases, `maxWorkers:1`, `configFile:false`, `envDir:false`, no watch/cache, and `finally` closure were retained. No peer source/configuration, install, or symlink was used.

| Check | Result |
| --- | --- |
| Fresh focused selection | 4 files, 267 passes, zero failures, exit 0 |
| Fresh independent probes | 57 recorded cases, all assertions satisfied, exit 0 |
| Fresh scoped lint | Five roots, zero errors/warnings, exit 0 |
| Fresh scoped types | Five roots and imports, zero diagnostics, exit 0 |
| Pinned diff whitespace | Exit 0 |

Probe distribution: 29 successful reads/previews and 28 refusals. Eight prior successes expose the old defect; these are controls, not candidate acceptance tests. The React detection notice is a tool notice, not a source warning.

The inspected fixed runner was executed through Node standard input with only its JSON/cache destinations changed to unique temporary paths. Exact filters:

```text
src/lib/workbook-progress-history.test.ts
src/lib/workbook-progress-history-store.test.ts
src/lib/workbook-progress.test.ts
src/lib/workbook-progress-plan.test.ts
```

Scoped command:

```sh
node /tmp/run-progress-history-472-scoped.mjs src/lib/workbook-progress-history.ts src/lib/workbook-progress-history-store.ts src/lib/workbook-progress-history.fixture.ts src/lib/workbook-progress-history.test.ts src/lib/workbook-progress-history-store.test.ts
```

Saved R3 prior JSON/log/exit agree: 259 passes, eight failures, exit 1. Saved fixed evidence agrees with the fresh 267-pass run. The separate R2 replay log/exit records 252 passes at the prior pin. Its restored task array is not the R3 prior array. Counts are not added across rounds. Root evidence under `/Users/savargupta/unica-workbook-samples/overnight-20261107/472-history-r3-*` was not changed.

## STANDARDS and limits

The only runtime change is the catalog gate. Byte comparison confirms core, preview, planner, and adapter remain unchanged from the prior pin. Public-interface probes exercise actual planning; they do not generate pages. Scoped lint/types do not prove the application build. Synthetic source/client checks do not prove hosted authorization, storage, recognition, or retention. Caller proof remains a caller obligation. UI, persistence, #471, and whole #472 remain outside scope.

Final verification found all 4,083 original tracked regular files and index bytes unchanged. Index SHA256: `0ad84f6dfb4e694a25f84448a7e616c0d7b886f5aa27b84e2871dad2b13c7b4a`. Only this report was added. Temporary probes/results were removed. All owned check processes stopped. No prohibited full gate, browser, server, generator, service, provider, customer action, commit, push, comment, or watch ran.

VERDICT: PASS - F2 only, with F1/F3 preservation confirmed.
