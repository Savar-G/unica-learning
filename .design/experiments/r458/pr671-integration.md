# Integration with the shared marking reader

Computer: Savars-MacBook-Pro-5.local.
Worktree: /Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-8f7f34bc.
Branch: site/scan-mark-corrections.
Base: bafcb95bb6ac249abd5365472a224b8963e5ecea, merged PR671.
Fixed source: 928514f4c4a3c75de32fad66ee30c94c2a2bddbc.

The shared reader is unchanged from PR671. Its SHA256 is 2f2cc0926c1a4716846d2b104f556a00a5f58f24b74a0a3c563568d135145de6. The child profile imports the lean reader. The full store re-exports the command and uses the reader for publication and effective marks. S5 retains canonical parent changes, history and pending profile/skill recovery.

The automatic rebase removed three type imports needed by S5's added functions. The compiler reported five TS2304 errors before the correction. The correction restores only type Observation, EffectiveMark and MarkingCommand imports. It changes no runtime operation, scoring rule, controller or model.

## Checks

- Full repository: 444 files, 16,672 tests passed, one optional skip, 304.90 seconds, exit zero.
- Affected public interfaces: 102 tests passed, exit zero.
- Voice packaging: seven tests passed, exit zero. The image packages remain outside the voice worker import graph.
- Voice typecheck, source lint and production build: each exited zero.
- Local SQL: 36 S5 public PATCH/action/store/SQL cases passed. The 48 inherited S4 cases passed before and after the wrapper migration.
- Owned local PostgreSQL cluster stopped. The final status returned no server running, exit three.

These checks prove local source and type integration, the tested synthetic correction/publication paths and local package boundaries. The reduced SQL fixture does not prove hosted Storage policies or provider recognition. This integration changes no schema or screen, so the earlier hosted and browser evidence remains separate. No hosted migration, paid call, production billing write or release-switch change ran. The independent integration review approved the fixed source. Its 21 runtime/import controls and 10 source comparisons passed. See pr671-review-final.md. No runtime source changed after that review.
