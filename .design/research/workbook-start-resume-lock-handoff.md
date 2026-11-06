HANDOFF_DONE

Issue [#612](https://github.com/Savar-G/unica-learning/issues/612) is ready for independent review.
The implementation changes the child lock in `start_workbook_run` from `FOR UPDATE` to `FOR NO KEY UPDATE`.
No other function behavior changes.

Computer: `Savars-MacBook-Pro-5.local`.
Supplied worktree: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-b7e52e85`.
Resolved worktree: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-b7e52e85`.
Branch: `site/workbook-start-resume-lock`.
Source base: `f3133376535b3c96f4c81f62f1f8d1cc80322a23` (`origin/main`, PR #662 merged).
The prepared worktree was clean at `550fdcf1619c0e515e8ac33e2a65869d8c937af7`.
`git fetch origin main` and `git merge --ff-only origin/main` both exited 0.
The local commit that contains this file is the review candidate. Resolve it with `git log -1 --format=%H -- .design/research/workbook-start-resume-lock-handoff.md`.

Implementation and checks: OpenAI Codex, `gpt-6.1-sol`, high reasoning effort.
No child agents were used.
The Claude commit trailer is a repository requirement. It does not identify the implementation model.

Changed files:

- `supabase/migrations/20261106120000_workbook_start_resume_lock.sql`: additive replacement of the current start function. The body differs at one lock clause. The signature, answers, security definer, empty search path, and service-only grants stay the same.
- `supabase/tests/workbook_start_resume.cjs`: local PostgreSQL bootstrap, concurrent RPC checks, negative control, regression checks, and cleanup.
- `supabase/tests/workbook_start_resume_fixture.sql`: reduced dependency tables and the advisory-lock barrier function.
- `.design/research/workbook-start-resume-lock-handoff.md`: this report.

The fixture loads the real workbook run, audit, and page tables from the existing migrations.
It loads both real resume overloads and the real start, claim, yield, rename, family fence, child fence, plan admission fence, and family time functions.
It retains the real composite child foreign keys and the active-run unique index.
The parent, child, workbook, draft, and billing dependency tables are reduced local fixtures.
The admin policy predicate returns false in this fixture.
The fixture does not replay the complete application schema.

The concurrency check uses two service-role actor sessions and one local observer session.
The observer holds advisory lock `(612,1)`.
A test-only trigger pauses the real resume RPC at its run update, after the RPC has locked the run.
`pg_blocking_pids` must show that resume waits for the observer.
The real start RPC then runs for the same child and run.
`pg_blocking_pids` must show that start waits for resume.
The observer also checks the child's `FOR KEY SHARE NOWAIT` result before it releases the barrier.
The old child lock must reject that check with `55P03`.
The corrected child lock must permit it.
Only those observed locks permit the observer to release the barrier.
There is no sleep-based ordering.
Lock and statement timeouts only bound failure and select the resume session as the deadlock victim.

The old candidate produced SQLSTATE `40P01` for both resume overloads.
The corrected candidate completed both identical concurrent sequences.
The old candidate's PostgreSQL error context names `children`, `FOR KEY SHARE OF x`, and the `workbook_audit` insertion in `resume_workbook_run`.
The final run included this real wait cycle for the four-argument overload:

```text
Process 10136 waits for ShareLock on transaction 781; blocked by process 10137.
Process 10137 waits for ShareLock on transaction 780; blocked by process 10136.
```

The fixed sequence returns false from the capped resume and `started` from start.
It retains one active replacement run.
The previous run ends as `stale`, with 30 resumes, no lease, and a finish time.
Its audit keeps `run-failed` followed by `run-stopped`.
This is the current start function's behavior after it waits for the capped resume. The migration preserves it.

Each check declares its falsifier before it runs.
The main falsifiers are a missing lock barrier, a timeout in place of a real deadlock, any deadlock on the corrected candidate, two active runs, a changed RPC result, a lost write fence, or browser-role execute access.

Commands and exits on Node.js `v22.23.1`, PostgreSQL `18.6`:

| Command | Exit | Result |
| --- | --- | --- |
| `npm install --prefix /tmp/pd612-deps-V15yBT --ignore-scripts --no-audit --no-fund pg@8.16.3` | 0 | Installed only the existing test dependency in a disposable local directory. No repository dependency file changed. |
| `node --check supabase/tests/workbook_start_resume.cjs` | 0 | JavaScript syntax accepted. |
| `NODE_PATH=/tmp/pd612-deps-V15yBT/node_modules node supabase/tests/workbook_start_resume.cjs` | 0 | `WORKBOOK_START_RESUME_OK 12`. Includes two expected old deadlocks and two corrected concurrent successes. |
| `NODE_PATH=/tmp/pd612-deps-V15yBT/node_modules node supabase/tests/workbook_start_resume.cjs old` | 1, expected | `OLD_CANDIDATE_REJECTED: SQLSTATE 40P01`. Both old resume paths reproduced the deadlock. |
| Exact old/new function comparison in Python | 0 | Only `for update` became `for no key update`. Both explicit grant statements matched. No new file contained an em dash. |
| `git diff --check` | 0 | No whitespace errors. |

After the repository dependencies are installed, reproduce with `node supabase/tests/workbook_start_resume.cjs`.
Use the positional argument `old` to require a failing old candidate.
Use `fixed` to check only the corrected candidate and its regressions.
`PG_BIN` can select another local PostgreSQL binary directory.
The test accepts no hosted URL or pre-existing database.
It creates a new `/tmp/pd612-pg-*` Unix socket and cluster on each run, with TCP listening disabled.

Local command logs are ignored worktree files:

- `.next/issue612-proof/final.log`: final combined command, exit 0, 12 PASS lines.
- `.next/issue612-proof/old.log`: final old-only command, expected exit 1.

Proof by subsystem:

- Concurrency: real PostgreSQL produced the old foreign-key deadlock and accepted both corrected sequences. This does not prove hosted operation.
- Run state: public RPC checks prove one active run, normal start/busy/refusal, claim runner checks, handover and stale-lease resume, queued/running stalled results, the 30-resume failure, and terminal refusal. No model or generator ran.
- Rename: concurrent public RPC checks prove start and rename still exclude each other in both orders. This does not test the rename UI.
- Deletion: real write fences reject local family and child deletion writes through start/resume, without retained new runs or start audit rows. No hosted deletion ran.
- Plans: real plan write-boundary functions reject cancelled, pending, and paused local states. Unrelated billing RPCs and external payment actions are outside the fixture.
- Security: anon and authenticated cannot execute start or either resume overload. Service-role RPC calls succeed. The start function retains security definer and an empty search path. Hosted role configuration remains unverified.
- Migration: the database function definition differs only at the child lock mode. The attached start/child trigger definitions are identical before and after migration. The full production migration history was not replayed.
- Cleanup: each test run stopped its own cluster, confirmed `pg_ctl status` returned 3, and removed its own temporary directory. No fixture PostgreSQL process remained after the checks.

Controller verification on 2026-11-05:

- Independent Sol review: APPROVE, no findings, on commit `876f767796251431c970a2ce20312841a7dbdc76`.
- Root reran the local fixture: exit 0, `WORKBOOK_START_RESUME_OK 12`, and confirmed cleanup.
- Before application, the hosted function matched the reviewed old body after removal of SQL comments and spacing.
- Applied through Supabase MCP to project `cdjobwsyzndtltzfpyqa`. The registry records `20261106033145`, name `workbook_start_resume_lock`.
- The hosted function body has MD5 `42e7795ed3a2b1b7fca45f166b8fbd83`, exactly matching the reviewed replacement. The corrected lock is present.
- Hosted execute permission remains false for anon and authenticated, and true for service_role. Security definer and the empty search path remain.
- Security advisors have the same categories and counts before and after application. They report no finding for this function.
- `npm run db:types` exited 0 and produced no file change. The function signature did not change.
- The full test gate passed: 441 files, 16,610 tests passed, one skipped, exit 0, in 953.93 seconds. The normal production build and full source lint also exited 0.

Hosted checks prove the stored definition and permissions. They do not prove a concurrent live-family run. No family rows were written.

Remaining work belongs to the controller:

- Own the push, pull request, and merge.

This SQL-only change does not change book content. The controller retains the final subscription sample pair for the content lane.

This child made no hosted writes, provider calls, live worker setting changes, service restarts, customer job claims, or customer books.
It did not change generator, quality, worker, or shared generated type files.
