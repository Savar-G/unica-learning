# Shared delegate brief

Read `AGENTS.md` first—all repo rules (worktrees, migrations, copy, anti-test-sprawl, Vercel budget) are binding. Use `docs/feature-map.md` to locate routes/surfaces and `docs/agents/verify-app.md` for runtime proof.

## Execution & checks

- Work in your own worktree on `site/<topic>` from `origin/main`. Keep diffs small, direct, and focused on your assigned scope.
- Use `npm run check:fast` (`repo-guard` + `oxlint` + `tsgo`) in the inner loop before running the full suite.
- Tests that import `server-only` need `vi.mock("server-only", () => ({}))`.
- Run the done gate once before pushing and check every exit code:

```sh
npm test > /tmp/delegate-test.log 2>&1
test_exit=$?
printf 'test exit=%s\n' "$test_exit"
rg 'Test Files|Tests|Duration' /tmp/delegate-test.log
npm run check:guard && npx eslint src && npm run typecheck && npm run build
```

- If `bank-grades-3-5.test.ts`, `parent-pin.test.ts`, or the Chromium launch test flakes, rerun that single file and report both the first failure and the rerun result.
- If you touch `src/lib/maya/` or `worker/`, also run `npm run voice:test && npm run voice:typecheck`.

## Rules, findings & classes

- The brief's rule table is the contract: each row needs a test. Report a row that has no test or that conflicts with another row; do not guess.
- For each review finding, first search for every other place with the same kind of mistake and report the list (place, affected or not, why). Fix and test the class with a table test or a `fast-check` property, not only the reported case.
- If the same class was found before, do not add another case. Remove the feature, use one shared helper, or change the data so that the mistake is not possible. Details: [review rounds](review-rounds.md).
- Before you copy a rule, look for the existing helper or constant and use it.

## Pre-push slop & suppression audit

Before opening or updating a PR, inspect your diff (`git diff origin/main`):
- **No new suppressions or workaround comments:** Do not add `eslint-disable`, `oxlint-disable`, `@ts-ignore`, `@ts-expect-error`, or comments rationalizing hacks (e.g. timeouts/retries papering over a race). Fix the root cause; if an invariant must hold forever, encode it as a test or guardrail (`scripts/repo-guard.mjs`) instead of a warning comment.
- **No silent monolith growth or test sprawl:** Extract helpers instead of growing large files; add tests to existing `<name>.test.ts` files.
- **Tighten ratchets when you clean up:** If your PR shrinks a legacy file or removes a `useEffect` / suppression, run `node scripts/repo-guard.mjs --ratchet` and include the tightened `scripts/repo-guard-baseline.json`.

## Workbook generator rounds

- Follow [Workbook rounds](../workbook-rounds.md) and [the fast loop](../workbook-fast-loop.md). Use fake runs and only affected tests in the inner loop—never run a real AI sample or the full test suite after each fix.
- At the end of a round, run one real U4 and U16 pair for days 1,5,10 in parallel with `--replay`. Review contact sheets, `<label>-pages.md`, and changed pages. Push once per round.

## Multi-step / unattended runs (decision log)

For multi-phase or autonomous runs (e.g., workbook rounds, state-machine waves, overnight tasks), keep a compact single-line TSV log (`ts\tphase\tdecision\twhy\tevidence\tresult`) pointing to concrete artifacts (commit SHAs, screenshot paths, test outputs—never prose essays) and summarize key pointers inside `<details>` in the PR.

## Delivery

- Push and open a small, focused PR. Do not merge it.
- Keep commits and PR descriptions clean and model-agnostic (no hardcoded provider attribution).
- Report back with: **PR URL, head SHA, summary of changes, check results, and anything left unverified.**
