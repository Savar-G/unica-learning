# Shared agent brief

Read `AGENTS.md` first. Its rules are binding. Use plain language. Use Unica Learning in new code and text.

Work in your own worktree on `site/<topic>` from `origin/main`. Never switch branches in the main checkout. Never commit `worker/*/node_modules`.

Apply required migrations through the Supabase Management API or MCP to project `cdjobwsyzndtltzfpyqa`. Use the Keychain token `supabase-pagewise`. Then run `npm run db:types`. Keep the types diff limited to your changes.

## Checks before the push

Use only public interfaces in tests. Tests that import `server-only` need `vi.mock("server-only", () => ({}))`.

Run the full gate once before the push. Check each exit code.

```sh
npm test > /tmp/delegate-test.log 2>&1
test_exit=$?
printf 'test exit=%s\n' "$test_exit"
rg 'Test Files|Tests|Duration' /tmp/delegate-test.log
```

```sh
npx eslint src && npm run build
```

If `bank-grades-3-5.test.ts`, `parent-pin.test.ts` or the Chromium launch test fails, rerun that test alone. Report the first failure and the rerun result.

If you change `worker/` or Maya voice code, also run `npm run voice:test` and `npm run voice:typecheck`.

## Workbook generator work

Follow [Workbook rounds](../workbook-rounds.md) and [the fast loop](../workbook-fast-loop.md). Use fake runs and only the affected tests in the inner loop. Do not run a real AI sample or the full test suite after each fix.

At the end of the round, run the final real U4 and U16 pair for days 1,5,10 in parallel with `--replay`. Keep the full seeded checks and the sample review required by the round guide. Read contact sheets, `<label>-pages.md` and changed pages. Push once per round.

## Delivery

Push and open a small PR. Do not merge it. End each commit with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. End the PR body with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Report the PR URL, head SHA, changes and check results. The PR then needs a scoped Codex review.
