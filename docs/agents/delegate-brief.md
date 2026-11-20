# Shared delegate brief

Read `AGENTS.md` first—all repo rules (worktrees, migrations, copy, anti-test-sprawl, Vercel budget) are binding.

## Execution & checks

- Work in your own worktree on `site/<topic>` from `origin/main`. Keep diffs small, direct, and focused on your assigned scope.
- Tests that import `server-only` need `vi.mock("server-only", () => ({}))`.
- Run the done gate once before pushing and check every exit code:

```sh
npm test > /tmp/delegate-test.log 2>&1
test_exit=$?
printf 'test exit=%s\n' "$test_exit"
rg 'Test Files|Tests|Duration' /tmp/delegate-test.log
npx eslint src && npm run typecheck && npm run build
```

- If `bank-grades-3-5.test.ts`, `parent-pin.test.ts`, or the Chromium launch test flakes, rerun that single file and report both the first failure and the rerun result.
- If you touch `src/lib/maya/` or `worker/`, also run `npm run voice:test && npm run voice:typecheck`.

## Workbook generator rounds

- Follow [Workbook rounds](../workbook-rounds.md) and [the fast loop](../workbook-fast-loop.md). Use fake runs and only affected tests in the inner loop—never run a real AI sample or the full test suite after each fix.
- At the end of a round, run one real U4 and U16 pair for days 1,5,10 in parallel with `--replay`. Review contact sheets, `<label>-pages.md`, and changed pages. Push once per round.

## Delivery

- Push and open a small, focused PR. Do not merge it.
- Keep commits and PR descriptions clean and model-agnostic (no hardcoded provider attribution).
- Report back with: **PR URL, head SHA, summary of changes, check results, and anything left unverified.**
