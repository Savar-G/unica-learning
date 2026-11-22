# Cold-Start App Verification Guide

How any agent verifies observable runtime behavior in Unica Learning before claiming a task is done. A green build or unit test is **not** proof for routes, webhooks, crons, migrations, or UI (`AGENTS.md`).

## 1. Fast local static gate (run first, < 9 s)

```sh
npm run check:fast
```

Runs `repo-guard`, `oxlint`, `next typegen && tsgo --noEmit`, `scripts:typecheck`, and `voice:typecheck` in parallel.

## 2. Targeted subsystem checks

| Area touched | Run before full done gate |
| --- | --- |
| Guardrails, CI, or feature map | `npm run check:guard && node --test scripts/repo-guard.test.mjs scripts/pre-push-check.test.mjs .github/scripts/pr-scope.test.mjs` |
| State lists or DB `CHECK` constraints | `npm run db:checks && npx vitest run src/lib/state-lists.test.ts --sequence.shuffle` |
| Family time zones / postal SQL | `node scripts/generate-family-zones.mjs --check && npx vitest run src/lib/family-time.test.ts --sequence.shuffle` |
| Maya tutor or voice worker | `npm run voice:test && npm run voice:typecheck && npx vitest run src/lib/maya-text.test.ts --sequence.shuffle` |
| Workbook generator inner loop | `npm run workbook:fast` (fake runs + affected tests only; see `docs/workbook-fast-loop.md`) |
| Robots, canonicals, or sitemap | `node scripts/seo-guard.mjs` |
| Design system (`src/ds`) | `npm run build:ds` |

## 3. Running the local web app safely

1. Check if port `3000` is free (`lsof -i :3000`); if busy, pass `-p 3005` (or another unused port) so you never collide with another worktree's dev server.
2. Start with `npx next dev -p <port>` in a background task and wait for `Ready in`.
3. Stop your dev server when finished.

## 4. Browser & authenticated UI verification (`aside`)

Use `aside --account u0` (never Playwright/Puppeteer, except `src/lib/print-engine-chromium.ts`). If you haven't used Aside REPL yet, run `aside guide repl` once.

- **Test-family safety:** Only authenticate or mutate accounts in `public.test_accounts` / `admin_team_ids()`. Never write test data or trigger side-effects on real families.
- **No prod admin polling:** If you inspect a live `/admin/*` page, open it once, capture your screenshot/check, and close the tab immediately.
- **Check both viewports for UI changes:** Desktop (`1280px`) and mobile (`390px`)—verify zero horizontal overflow, clean typography/contrast, and real rendered states (not just loading spinners).
- **T3 Preview:** Use `preview_*` tools only when the user explicitly asks to preview/show work in T3 Preview.

## 5. Verifying API routes, webhooks & migrations

- **Auth boundaries:** Prove both unauthenticated (`401`/`403`) and authorized (`200`) responses with explicit status codes—not assumptions.
- **Migrations:** After applying a migration via Supabase MCP `apply_migration`, verify via `list_migrations` + a read-only SQL probe, then run `npm run db:types` (and `npm run db:checks` when adding/editing `CHECK` constraints) and commit the generated files in the same PR.

## 6. Done gate & PR proof artifacts

Before pushing a PR:
1. Run the done gate once: `npm test && npx eslint src && npm run typecheck && npm run build` (plus `npm run voice:test && npm run voice:typecheck` if `src/lib/maya/` or `worker/` changed).
2. Put observable proof in `.github/PULL_REQUEST_TEMPLATE.md`:
   - UI changes: Before / After screenshots in the top table.
   - Non-UI changes: concise Before / After behavior rows plus exact command results and **explicitly list anything not verified** inside `<details>`.
