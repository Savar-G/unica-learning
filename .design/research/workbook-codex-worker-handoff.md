# Workbook Codex worker implementation

HANDOFF_DONE

Issue: https://github.com/Savar-G/unica-learning/issues/665

Computer: Savars-MacBook-Pro-5.local.
Supplied worktree: /Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-f9db35eb.
Physical path: /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-f9db35eb.
Branch: site/workbook-codex-worker.
Original implementation source base: f3133376535b3c96f4c81f62f1f8d1cc80322a23.
The prepared worktree was clean at 550fdcf1619c0e515e8ac33e2a65869d8c937af7. It fast-forwarded to the required base before edits.
Read the delivery HEAD with `git rev-parse site/workbook-codex-worker` after the local commit.

Attribution: implemented by OpenAI Codex, gpt-6.1-sol, high effort, on the Unify Codex account. The current CODEX_HOME was verified as /Users/savargupta/.codex-t3/unify. No model request was made. The Claude co-author trailer follows the repo rule. It does not identify the implementation model.

## Result

- WORKBOOK_SUBSCRIPTION_PROVIDER accepts claude or codex. An absent setting keeps the Claude default. Empty and unknown values fail closed.
- Codex mode requires WORKBOOK_CODEX_HOME as an explicit absolute account home. Inherited CODEX_HOME does not select an account.
- The shared factory reuses codexCliClient for both the page writer and separate solver requests. It creates no API client in Codex mode, even with keys, API-first settings, or an API-first caller override. It refuses Codex in a process that cannot run subscriptions.
- Writer, solver, call records, draft model, and frame identity use codex/gpt-6.1-sol;reasoning=high;auth=chatgpt. The CLI still receives the raw gpt-6.1-sol model and high effort. Claude and API model settings do not alter it.
- The worker checks local Codex availability before service access at startup and before each generation or edit job claim. It requires a ChatGPT file login in the selected home, required CLI options, and a successful ChatGPT login status. The checks send no model request.
- The installer reads the saved provider through Node dotenv parsing. It includes the selected CLI in the service path. It does not require Claude for a Codex worker. An environment-only Codex install with no saved settings fails before service changes.
- Cancellation guards, temporary request cleanup, process cancellation, and the existing durable run provider exclusions remain in place. No generator, quality, layout, question-package schema, worker loop, or job implementation file changed.

## Changed files

- src/lib/workbook-ai.ts: provider selection, fixed Codex identity, API exclusion, local preflight entry point.
- src/lib/workbook-ai.test.ts: factory selection, account isolation, API exclusion, records, saved exclusions, cancellation, Claude controls, and public job frame/resume checks.
- src/lib/ai-codex-cli.ts: shared environment filter, fixed model/config identity, and local preflight.
- src/lib/ai-codex-cli.test.ts: model identity and local availability/configuration controls. Existing cancellation and cache checks remain.
- scripts/workbook-worker.ts: startup and before-claim gates, selected-provider logging.
- scripts/install-workbook-worker.sh: selected CLI path and provider/home template.
- src/lib/workbook-worker-install.test.ts: Codex-only CLI fixture, saved settings controls, private default template, and the existing process-stop ordering control.
- src/lib/workbook-worker-provider.test.ts: real worker entry point with synthetic service, queue, and CLI boundaries.
- docs/workbook-worker.md: settings, identity, setup, failure behavior, and proof limits.
- .design/research/workbook-codex-worker-handoff.md: this report.

## Falsifiers and results

Factory: any API dispatch, inherited account selection, Claude identity in Codex mode, answered cancellation, or retry after a saved lasting exclusion disproves the change. The public factory tests reject each case.

Worker: a service access or claim after failed startup preflight, or a claim after availability is lost between jobs, disproves the gate. The worker entry-point tests reject each case. They cover both a claim and resume. All service and queue operations are synthetic.

Frame: accepting a changed writer, solver, or effort identity disproves resume safety. Public runWorkbookJob tests store a Codex frame, accept the same identity, and refuse all three changes before any provider dispatch. They use the legacy item policy to isolate model identity from capacity/layout changes. The fit and print seams are not physical print proof.

Installer: a Codex install that needs Claude, loses its selected CLI path, mutates the existing settings, changes the service for an invalid provider, or changes code before the old process stops disproves the installer behavior. The public shell tests reject these cases. They use a temporary HOME, fake git/npm/launchctl commands, and only their own test process.

Cancellation: the factory test proves signal propagation and no answered record or API call after cancellation. The adapter test also cancels during result-file reading and proves no cache entry and temporary-file cleanup. Process signal delivery uses the existing shared nodeSpawn adapter, which this lane did not change.

## Commands and exits

Commands ran in this worktree. Logs are local and ignored under .workbook-worker/.

1. `git fetch origin main` and `git merge --ff-only origin/main`: exit 0. Required base reached without reset or discarded files.
2. `npm ci --no-audit --no-fund`: exit 0. No lockfile change.
3. `npx vitest run src/lib/workbook-ai.test.ts` against the original implementation: exit 1. Eight new tests failed and 15 passed. Log: .workbook-worker/provider-red.log.
4. `npx vitest run src/lib/workbook-ai.test.ts src/lib/ai-codex-cli.test.ts src/lib/workbook-worker-provider.test.ts src/lib/workbook-worker-install.test.ts src/lib/workbook-worker.test.ts src/lib/workbook-job-store.test.ts`: final exit 0. Test Files 6 passed (6). Tests 83 passed (83). Duration 6.88 seconds. Log: .workbook-worker/provider-final-tests.log. This includes the standalone production worker bundle check.
5. `npx eslint src/lib/workbook-ai.ts src/lib/workbook-ai.test.ts src/lib/ai-codex-cli.ts src/lib/ai-codex-cli.test.ts src/lib/workbook-worker-provider.test.ts src/lib/workbook-worker-install.test.ts scripts/workbook-worker.ts`: exit 0. Log: .workbook-worker/provider-eslint.log.
6. `bash -n scripts/install-workbook-worker.sh`: exit 0.
7. Initial `npx tsc --noEmit --incremental false`: exit 2. Fresh-checkout Next route/image types were absent. It also found missing NODE_ENV fields in two new child-process test fixtures. Those fields were fixed.
8. `npx next typegen`: exit 0. Generated local ignored Next types. Log: .workbook-worker/provider-typegen.log.
9. Repeated `npx tsc --noEmit --incremental false`: exit 0. Log: .workbook-worker/provider-types.log.
10. `git diff --check`: exit 0.
11. `codex --help`, `codex exec --help`, and `codex login --help`: exit 0. Local command documentation only. No login change or model request.

The first frame probe failed because its synthetic child ID was not a UUID. The fixture now uses valid UUIDs. All four frame cases pass in the final six-file run.

## Limits and controller work

- No real Codex or Claude request ran. Local checks cannot prove remote model access, token validity, or available quota. The controller owns any synthetic subscription smoke.
- A file login in the selected home is required. A keychain-only login fails closed.
- A lasting subscription failure remains excluded within the run through the existing stored provider gate. Local startup checks do not predict a new remote usage limit.
- The model/config identity is more specific than the old sample identity gpt-6.1-sol. Old Codex sample cache entries with only that identity will miss and require new subscription requests. A factory request can replay a cache only when the full identity and request match.
- The sample CLI's explicit --codex path uses the same adapter identity. Its generic default-path status text still describes Claude if only the new environment selector is used. That script belongs to the controller; this lane did not change it. Use --codex for the final Codex sample pair, or let the controller update its generic status text.
- No fake book or physical print was made in this provider-only lane. A fake sample bypasses the changed provider path. The controller owns combined book and print evidence.
- The full npm test, full src lint, Next production build, final U4/U16 replay pair, independent review, push, PR, and merge remain with the controller.
- No live worker settings or source changed. No service restart, family job claim, hosted data write, paid API call, or customer book generation occurred. The installer ran only against synthetic fixtures.

No unresolved implementation finding remains in this lane. The generic sample status-text limit above needs controller coordination if that environment-only sample path is used.

## Controller verification

- Independent Unify Codex Sol high review approved commit `f915b316506180eb17efc69f0494d4afd4044cc0`. No findings remained.
- Root repeated the six-file focused command: 83 tests passed, exit 0.
- Root ran the real shared factory against the explicit Unify Codex home, with two synthetic arithmetic requests and no database access. The writer returned 4 for 2 plus 2. The solver returned 5 for 2 plus 3.
- Both call records named `codex/gpt-6.1-sol;reasoning=high;auth=chatgpt`, provider subscription, outcome answered, and USD 0 API cost. Writer time was 4,489 ms. Solver time was 6,382 ms.
- The real check supplied an API-first caller override and a synthetic API key. A fetch guard counted zero API calls.
- This proves real subscription requests through the factory. It does not prove a running launchd worker, queued-family work, printed books, or hosted operation. Live worker settings and services were not changed.
- The full test gate passed: 442 files, 16,649 tests passed, one skipped, exit 0, in 563.38 seconds. Full source lint and the normal production build also exited 0. Root retains push, PR and merge.

The local smoke script and log are ignored evidence files. They contain no family data or credentials.

After PR #668 merged, the controller rebased onto `0d9285c7d1635cff8bbf569ad17eb0608fd3a300`. Git range-diff confirmed identical implementation and proof-report patches. The six focused worker/provider suites plus both new practice harness suites passed: 8 files, 200 tests, exit 0. This is local synthetic integration proof. Rejected and held generated items do not become passes. The #531 API acceptance hold remains.
