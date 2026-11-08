# S4 local verification

Computer: Savars-MacBook-Pro-5.local.
Logical worktree: /Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-3fc2643b.
Physical worktree: /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-3fc2643b.
Branch: t3/pd-marking-implementation.
Base: 89ecf73965eccbf0f59e49401b69cf09a4e12579.

The falsifiers were written in docs/scan-marking.md before the implementation checks.

- Recognition workflow: 191 tests across 16 files passed with two workers. This includes the directly affected profile, observation, image, crop and scan-stack cases. It passed through no live provider, hosted store or browser.
- SQL: 20 synthetic cases passed. Actual new SQL functions and existing family/child, calibration and Storage fences ran in a disposable PostgreSQL 18 cluster. Concurrent cases used separate connections and observed server lock waits without timing sleeps. Reduced dependency tables do not prove the full hosted schema, Storage HTTP signing endpoints or worker credentials.
- Result rendering: React static rendering checked pending, unscored, expired-image, escaped reading text and budget states. This does not prove desktop, tablet, phone, focus, motion or visual approval.
- Lint: touched TypeScript and TSX files passed. No full source lint or full test suite ran.
- Compilation: next typegen passed. TypeScript exited 2 with four missing-schema diagnostics, in child-profile-store.ts, database.ts, scan-marking-server.ts and scan-marking-store.ts. They name save_marked_child_profile, scan_marking_command and recover_scan_marking. The generated schema file was not edited. Parent must apply SQL and generate types before the full build.
- Provider cost/accuracy: no paid request ran. No model accuracy, provider privacy setting or verified production price bound is claimed. Price rows and the marking release are off by default.

Initial execution evidence: the shared dependency location did not contain Vitest. Dependencies were then installed in this worktree with npm ci --ignore-scripts. The first product run passed 20 new workflow cases. The expanded run found one older PostgREST fake that lacked the new RPCs; the fake was extended and its 22 cases now pass. The first SQL run had two fixture errors: the sibling job was claimed while the first job still owned the family slot, and a SQL literal needed an explicit smallint type. The corrected scenarios passed. These were fixture errors, not product failures, and are not claimed as a before/after product fix.

A binding regression ran against the earlier local schema: the shared upload/marking slot case failed because marking started while an upload held the slot. The corrected SQL makes both paths count the same active work. The same case and all 19 other SQL cases then passed. See shared-slot-before.log and sql-tests.log.

The parent owns hosted schema probes, generated types, the full done gate, browser checks, fixed-set paid model comparison if separately authorized, provider privacy verification, sample approval and independent review. D-235 remains a family release hold. No sibling branch was imported. No dependent correction/history/dashboard slice was built. No push, PR, merge or watch ran.
