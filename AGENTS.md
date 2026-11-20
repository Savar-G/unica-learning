<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Unica Learning — Agent Guide

Personalized math learning program with mailed paper workbooks for ages 5–14 (Kindergarten–Grade 9; reading planned later). Brand: **Unica Learning** (D-056)—never write "Pagewise" in new code or copy (only the Supabase project name and old design records still use it).

> **Keep this file under 150 lines (~10 KB).** Never document individual tables, RPCs, migrations, or env vars here—put subsystem details in `docs/<topic>.md` and add a 1-line row to the Topic Map.

## Agent skills

- **Issue tracker:** GitHub Issues on `Savar-G/unica-learning` via `gh` CLI (`docs/agents/issue-tracker.md`).
- **Triage labels:** `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` (`docs/agents/triage-labels.md`).
- **Domain docs:** `.design/decisions.md` (ADRs), `DESIGN.md`, `CONTEXT.md` (`docs/agents/domain.md`).
- **Delegates:** Read `docs/agents/delegate-brief.md` before delegated PR work.

## Code & test discipline

- **Small, modular code:** Prefer minimal, direct edits and focused files. Do not grow monoliths (`src/lib/maya/session.ts`, `src/lib/workbook-generator.ts`); extract helpers when adding substantial logic.
- **Tests (Vitest, `src/**/*.test.ts`):** Test public interfaces with in-memory seams and injected clocks. Clear mocks and browser storage before each test, restore env/global stubs after, and run changed tests shuffled (`--sequence.shuffle`).
- **No test sprawl:** Add tests to the module's existing `<name>.test.ts`. Never create ticket-, PR-, or review-round-named test files (`*-final-check*`, `*-698`, `*-fixes`, `*-review*`). Test behavior and real invariants—no duplicate assertions or prose-grepping tests.
- **Concise plans:** Sacrifice grammar for concision; end every plan with unresolved questions.

## Git, PRs & Vercel

- **Branches & worktrees:** Work in your own worktree on `site/<topic>` from `origin/main`. Never switch branches in the main checkout (`git worktree list`). Never commit `worker/*/node_modules`. Never name non-blog branches `claude/blog-*`.
- **PRs & merges:** Open a PR yourself when done—do not ask first. **Never merge to `main` unless Savar asks** (merging deploys production).
- **PR format:** Write for human reviewers using `.github/PULL_REQUEST_TEMPLATE.md`—plain-English title, 1–2 line summary, short Before/After table, optional preview link, and all technical/agent details inside `<details>`.
- **Post-merge ("merge and clean up"):** Delete merged remote & local branches, remove the task worktree, fast-forward local `main`, and verify the `test` CI check + live production behavior (and LiveKit deploy if `worker/maya-voice/` changed).
- **Vercel Hobby cap (~100/day):** Only `main` auto-deploys (`vercel.json`); CI checks branches. Push once per review round; merge `main` only for conflicts or right before merge; never push empty commits (use `npx vercel@latest redeploy <url>` for infra failures). Manual previews only when needed (`npx vercel@latest deploy --scope unica-learning`).
- **Git LFS:** `.design/` media uses LFS (`git lfs install`; `git add --renormalize .design` if dirty after merge). Never put `src/` or `public/` assets in LFS (Vercel builds with LFS off).

## Verification & done gate

- **Done gate:** Run `npm test && npx eslint src && npm run typecheck && npm run build` once before pushing (`npm run typecheck` runs `next typegen && tsgo --noEmit`).
- **Maya / worker:** When touching `src/lib/maya/` or `worker/`, also run `npm run voice:test && npm run voice:typecheck` and `src/lib/maya-text*.test.ts`. Maya changes merge on green CI; run `npm run maya:practice` after a batch lands on `main` (`docs/maya-practice.md`).
- **Evidence before confidence:** A green build is not proof for routes, webhooks, crons, or UI. Verify observable runtime behavior (401 vs 200, browser check, hosted DB probe) and explicitly state anything unverified.
- **Browser checks:** Use `aside --account u0` (`aside exec` / `aside repl`; run `aside guide repl` once) for authenticated dashboards, email, E2E, and local checks—never Playwright/Puppeteer (except `src/lib/print-engine-chromium.ts`). Use T3 `preview_*` when asked to show work in T3 Preview.

## Database, keys & production safety

- **Migrations:** Apply yourself via Supabase MCP `apply_migration` (`cdjobwsyzndtltzfpyqa`) or Management API (Keychain `supabase-pagewise`; never `supabase login`). Additive only, filename `supabase/migrations/<yyyymmddHHMMSS>_<name>.sql`, verify via `list_migrations` + probe. Run `npm run db:types` (and `npm run db:checks` on check constraints) and commit in the same PR. Never hand-edit `src/lib/database.types.ts` (overrides go in `src/lib/database.ts`) or add `overrideTypes`/`returns<T>()`/`maybeSingle<T>()`. See `docs/supabase-ops.md`.
- **AI keys & switches:** Each AI product needs its own OpenRouter key (`src/lib/ai-product-keys.ts`, `docs/ai-product-keys.md`). Shared `OPENROUTER_API_KEY` is disabled; duplicate keys disable all clients. Keep production feature switches off until Savar approves (`docs/environment.md`).
- **Real-family safety:** Exclude `public.test_accounts` and `admin_team_ids()` from customer metrics/queues. Never write test data or destructive probes to real families.
- **Admin polling & incidents:** Never leave prod admin pages open polling (open once, then close). On stuck-page reports, check site-wide 5xx and route traffic first (`npx vercel@latest logs requests`). Keep timeouts and non-looping retries on the child test screen (`src/components/test-save-failure.test.ts`).
- **Hard boundaries:** Never type payment card data. Never import `@sentry/nextjs` in any module reached by `worker/maya-voice` or the Mac workbook worker.

## Copy, brand & SEO

- Copy rules in `DESIGN.md` are binding. Customer-facing claims come from `docs/facts.md`—add a sourced fact there before using a new one.
- Plain language in customer text; no dev/draft labels; provider names only in `/privacy`.
- In marketing copy (ads, social, headlines, kickers), say **"a personalized math learning program"**—not "workbooks". No competitor names outside `/resources` and `/blog`.
- **SEO (D-319):** When changing visible copy on a page in `src/app/sitemap.ts`, update its `updated` date (blog posts: `meta.updated`). Never add FAQPage, HowTo, or review markup. Run `scripts/seo-guard.mjs` before changing robots, noindex, or canonicals.

## Accounts & non-discoverable IDs

| Service | Key IDs / Gotchas |
|---|---|
| Next.js 16 + React 19 | Route groups: `src/app/(site)` (marketing), `src/app/(product)` (app/admin); APIs/auth at top of `src/app`. Never duplicate a URL. Design system: `src/ds` (`npm run build:ds`). |
| Vercel | Project `unica-learning-landing-page`, team `unica-learning` (`--scope unica-learning`), region `sfo1`. Deployment Check requires CI `test`. Keep `package.json` name `unica-learning-landing-page` for `.design-sync`. |
| Supabase | Project `pagewise` (`cdjobwsyzndtltzfpyqa`, `us-west-1`), Keychain `supabase-pagewise`. Details: `docs/supabase-ops.md`. |
| GitHub | `Savar-G/unica-learning` (`gh` account `Savar-G`). Retention workflow: `.github/workflows/retention.yml`. |
| PostHog | Project `650128` (US). **Gotcha:** MCP defaults to Unify (`250953`)—run `switch-project` to `650128` first. Keep parent PII & child grade out of analytics. |
| Sentry | Org `unica-learning` (US), project `unica-web`. Never remove keys from `DATA_COLLECTION` (`src/lib/sentry-options.ts`). |
| Google Ads | Account `517-988-8609` (Vancouver time). Plan: `.design/ads/2026-10-bc-launch/ads-plan.md`, `docs/ad-tracking.md`. |
| Mac Workbook Worker | LaunchAgent `com.unicalearning.workbook-worker`, checkout `~/.unica-workbook-worker`, env `~/.config/unica/workbook-worker.env`. |

## Topic Map (read on demand)

| When touching... | Read... |
|---|---|
| Supabase auth, `pg_cron`, Vault, storage, email logs | `docs/supabase-ops.md` |
| Environment variables & feature switches | `docs/environment.md`, `docs/ai-product-keys.md` |
| Workbook generator loop, rounds & context | `docs/workbook-fast-loop.md`, `docs/workbook-rounds.md`, `.design/workbooks/CONTEXT.md` |
| Workbook rendering & print contract | `docs/workbook-rendering.md` (`src/lib/workbook-print-contract.ts`) |
| Mac workbook worker & Book 1 previews | `docs/workbook-worker.md`, `docs/first-pages.md` |
| Maya tutor, chat, practice & spend | `docs/maya-tutor.md`, `docs/maya-chat.md`, `docs/maya-practice.md`, `docs/maya-spend.md` |
| Maya voice worker (`worker/maya-voice/`) | `worker/maya-voice/AGENTS.md`, `docs/maya-voice.md`, `docs/maya-voice-deploy.md` |
| Parent dashboard, plan gate & billing | `docs/parent-dashboard.md` (`src/lib/plan-access.ts`), `docs/stripe-webhook.md` |
| Family time zones & date math | `docs/family-postal-time.md` (`src/lib/family-time.ts`) |
| Page scans, crops & AI marking | `docs/scan-pages.md`, `docs/scan-marking.md`, `docs/scan-marking-escalation.md` |
| Family deletion & retention | `docs/assessment-deletion.md` |
| State machines & DB checks | `docs/state-machines.md` |
| Blog posts & weekly publish | `docs/blog-style.md`, `docs/blog-topics.md`, `docs/blog-automation.md` |
| Design mockups & brand decisions | `/design`, `DESIGN.md`, `.design/decisions.md` (search with `rg`) |
| Sentry, monitoring & web analytics | `docs/sentry.md`, `docs/product-monitoring.md`, `docs/web-analytics.md` |
