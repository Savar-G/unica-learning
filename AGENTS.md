<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Unica Learning landing page - working conventions

Personalized, mailed math and reading workbooks for ages 6-12 (grades 1-7). The brand is Unica Learning (D-056). Never write "Pagewise" in new code or copy; only the Supabase project name and old design records still use it. Design truth: `DESIGN.md`. Decision history: `.design/decisions.md`.

## Agent rules

- Apply database migrations yourself. Do not ask Savar first. Write the SQL to `supabase/migrations/<yyyymmdd>_<name>.sql`, apply it with the Supabase MCP `apply_migration` (project `cdjobwsyzndtltzfpyqa`), and verify it with `list_migrations` and a probe query. Apply it before the code that needs it ships. Keep migrations additive, so the live code keeps working in between.
- Open a pull request yourself when you finish building something. Do not ask first. Use a branch named `site/<topic>`, from a worktree based on `origin/main`. Merging to `main` deploys production, so leave the merge to Savar unless he asks.
- Never switch branches in the main checkout. Other agents work in parallel worktrees (`git worktree list`).
- All design work goes through `/design`. Mockup rounds live in `.design/experiments/r<n>/`, with a `manifest.json`.
- Done gate: `npm test && npx eslint src && npm run build`, then check the change in the browser with `npm run dev`. `npm run lint` also scans `.design-sync/previews/`, which has old errors. Vitest does not typecheck; `npm run build` does.
- Tests (Vitest, `src/**/*.test.ts`) use only a module's public interface. The assessment core (`src/lib/assessment`, imported as `@/lib/assessment`) is the one tested seam today: pure TypeScript with no network, database, clock or `Math.random`. Its tests are the pattern for later ones.
- Copy rules in `DESIGN.md` are binding: no proof we do not have, no performance claims, and no competitor brand names outside `/resources` (compare with categories such as learning centres, D-064; `/resources` guides may name them with cited, dated facts, D-074).
- Use plain language in all customer text. Keep development notes and draft labels out of public pages. Give provider names only in the privacy disclosure, with a plain explanation.

## Tools and services

| Tool | What we use it for | Notes |
|---|---|---|
| Next.js 16 + React 19 (TypeScript) | The site and its API routes (`src/app`) | Read `node_modules/next/dist/docs/` before you write Next.js code. Design-system components live in `src/ds` (`npm run build:ds` builds `dist/ds`). |
| Vercel | Hosting, preview deploys, daily cron | Project `unica-learning-landing-page` (renamed from `ai-workbooks-landing-page` on 2026-10-08), team `team_FGQkGyJkN7E0rgmxUsvC2ZDL`. Pushes to `main` deploy production. Domain: `unicalearning.com`, bought on Vercel (2026-10-08) with Vercel DNS; `www.unicalearning.com` redirects to it (308). `pagewiselearning.vercel.app` and `ai-workbooks-landing-page.vercel.app` redirect to it (308, keeps the path). Cron `/api/keepalive` runs daily at 15:00 UTC (`vercel.json`). The claude.ai Vercel connector cannot see this project; use `npx vercel@latest` (CLI login `savargupta1922-1024`). |
| Supabase | Postgres store for signups and waitlist entries | Project `pagewise` (`cdjobwsyzndtltzfpyqa`). Tables `public.signups` and `public.signup_heard` ("how did you hear about us?" answers, joined on `ref`; newest row per ref wins); the site can only insert (RLS). Parent accounts: Supabase Auth users, with `public.parents` and `public.children`; new families are written by the service-only RPC `create_family` (one transaction, cap of 20 new families in 10 minutes, #82); a parent reads only their own rows. Assessments: `public.assessments`, `public.answers`, `public.assessment_facts`, `public.fact_answers`, and `public.reports` (one report per finished test, built by a background job after finish; a parent reads only their own rows). From the report: `public.card_setups` and `public.waitlist_joins` (one row per child; written by the server). Test families (D-099): `public.test_accounts` (one row per family an admin marked as a test; admins only), and the function `admin_team_ids()`; the admin dashboard leaves both out of its numbers. AI work reviews: `public.work_reviews` (one row per reviewed piece of work: error type, kind, comment, score 0-1, confidence, model; server only, no parent access). Reminders (#73): `public.email_log` (one row per reminder email and per unsubscribe; server only). The pg_cron job `assessment-reminders` (pg_net, every 15 minutes) posts to the URL in the Vault secret `reminders_url` with `Authorization: Bearer` + the Vault secret `reminders_cron_secret` (the same value as `CRON_SECRET` in Vercel); the optional Vault secret `reminders_vercel_bypass` lets it reach a protected preview. Change them with `vault.update_secret`; never put them in a migration or in git. Check runs in `cron.job_run_details` and answers in `net._http_response` (kept 6 hours). Auth settings (#63, #82): Confirm email on; the "Confirm signup" and "Magic link" templates show only the code `{{ .Token }}` and no link (signup confirms the email with a code, D-093; see `docs/assessment-signup.md`); Site URL `https://unicalearning.com`; Google provider on; the reset email template links to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`. The redirect allow list holds `unicalearning.com`, `localhost:3000` and exact preview aliases only, never a `*.vercel.app` wildcard; to test sign-in on a preview, add its branch alias (Vercel shortens long ones, so read it from `npx vercel@latest inspect`). Change Auth settings in the dashboard or through its Management API. The free plan pauses after 7 days without activity, so the keepalive cron calls `ping()`. Base schema: `supabase/schema.sql`; changes: `supabase/migrations/`. |
| PostHog | Product analytics and the signup funnel | Loads after analytics consent (`src/instrumentation-client.ts`), after idle for returning visitors. Events use the `/ingest` proxy (`next.config.ts`). Event names: `src/lib/track.ts`. Keep parent contact details and child grade out of analytics. PostHog MCP is available for queries. |
| Resend | Emails Savar about each new signup; emails parents | Email goes through the delivery module `src/lib/email-delivery.ts` (send once with a send key, or send without a key; outcomes sent, refused, unknown, busy; #143). Its Resend adapter `src/lib/email-resend.ts` reads `RESEND_API_KEY`, `EMAIL_FROM` and the 15 s time limit. The sign-in link and the card-link alert use it; the report job (#151) and the reminders (#152) still send on their own until those tickets merge. A 5xx, 408, timeout or lost answer is unknown: the claim stays and nothing sends it again. Signup alerts are sent from `/api/signup` after the response, from `onboarding@resend.dev`. `unicalearning.com` is verified (#56): the phone-to-laptop sign-in link (`src/lib/account-server.ts`) is sent from `EMAIL_FROM`. The report email to the parent (`src/lib/report-email.ts`) is sent from `EMAIL_FROM`; the report alert goes to `SIGNUP_NOTIFY_EMAIL`. Supabase Auth emails (password reset) go through Resend SMTP (`smtp.resend.com:465`, key `supabase_auth_smtp`, sending access only). Reminder emails (`src/lib/reminder-email.ts`, sent by `/api/reminders`) come from `EMAIL_FROM` with the CASL footer (business name, mailing address `16557 87A Ave, Surrey, BC V4N 5B2`, website) and an unsubscribe link (`/unsubscribe`, plus the RFC 8058 one-click header to `/api/unsubscribe`). The free plan takes 2 requests a second, so the job sends one email every 600 ms. |
| Stripe | Saves the card of BC-curriculum signups; charges start when the first workbook ships | `/api/signup` creates a Customer (metadata: `ref` = `signups.ref`, plan, price) and a Checkout Session in setup mode (`src/lib/stripe.ts`); nothing is charged. Stripe returns the parent to `/thank-you?session_id={CHECKOUT_SESSION_ID}` or `/?card=cancelled`. The thank-you page retrieves the session with its SetupIntent before it confirms card setup. To charge: in the Dashboard, start a CAD 99 monthly subscription with a 30% off, duration "once" coupon, so the first month is CAD 69.30 (math, D-090, D-091; customer metadata `first_month_price`; cards saved before 2026-10-11 were for CAD 139 or 229) on that customer with the saved card. Stripe is the record of who saved a card; Supabase does not know. From the report, `/api/account/card` creates one Customer per child (metadata `source=report`, `parent_id`, `child_id`, `assessment_id`, `report_id`; `ref` = `card_setups.id`); success returns to `/thank-you?...&from=report`, cancel returns to the report. |
| Anthropic API | AI work review and AI report text (#68) | Off unless `ANTHROPIC_API_KEY` is set: with no key, no AI call is made and the report sends without AI parts. Client: `@anthropic-ai/sdk` in `src/lib/work-review-claude.ts` (server only). Never use a Claude subscription or `claude -p` for the live site. The template checker (`npm run check:templates`) is a local build-time tool that uses `claude -p`. |
| Vitest | Unit tests: `npm test` runs `src/**/*.test.ts` | Config `vitest.config.mts` (`@` maps to `src`). Vitest needs esbuild 0.27 or later, which is why the repo pins esbuild ^0.28. |
| GitHub | Repo `Savar-G/unica-learning-landing-page` (renamed from `pagewise-landing-page` on 2026-10-08; GitHub redirects the old URL), pull requests, the family retention worker | Use the `Savar-G` account in `gh`. The Actions workflow `Family retention` (`.github/workflows/retention.yml`) deletes requested and 12-month-inactive families daily at 15:17 UTC (#117). It reads the variables `RETENTION_WORKER_ENABLED` (`on`) and `RETENTION_SUPABASE_URL`, and the secrets `RETENTION_SUPABASE_SECRET_KEY` (Supabase key `retention_worker`) and `RETENTION_STRIPE_SECRET_KEY` (restricted live key `unica-retention-worker`). Run it by hand with mode `dry` first. See `docs/assessment-deletion.md`. |

## Environment variables

| Variable | Used by |
|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | `src/lib/supabase.ts` (server only). Both default to `src/lib/supabase-public.ts`, which the account pages, the proxy and the browser use. Override those with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_UI_HOST`, `NEXT_PUBLIC_POSTHOG_INGEST` | PostHog client and proxy. Without the key, events log to the console in dev. |
| `RESEND_API_KEY`, `SIGNUP_NOTIFY_EMAIL` | Signup alert emails and report alerts |
| `EMAIL_FROM` | Sender of emails to parents, `Unica Learning <hello@unicalearning.com>` (Production and Preview). Without it, sign-in link emails fail. |
| `CRON_SECRET` | Protects `/api/keepalive` (Vercel cron sends it) and `/api/reminders` (pg_cron sends it from Vault). Production and Preview. `/api/reminders` does not run without it. |
| `SUPABASE_SECRET_KEY` | Server writes for parent accounts (`src/lib/supabase-auth.ts`). Never sent to the browser. |
| `STRIPE_SECRET_KEY` | Server only. Creation needs write access to Customers and Checkout Sessions. Card confirmation also needs access to retrieve a Checkout Session with its expanded SetupIntent. The admin dashboard (`/admin`, D-099) also needs read access to Subscriptions; without it the dashboard says it cannot tell who is paying. Verify the restricted key on the preview. Without a key (or if creation fails), BC parents see "we'll email you a link to add your card" and the signup alert says so. |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ALLOW_INDEX` | Share-card links; search indexing switch |
| `ANTHROPIC_API_KEY` | Server only. Turns on the AI work review and AI report text (#68); unset means off. An Anthropic API key, never a Claude subscription. |
| `AI_REVIEW_MODEL` | Claude model for #68; default `claude-sonnet-5-5`. |
| `AI_REVIEW_FAKE` | Development only (ignored in production): `sure` or `unsure` runs the report job with a fake reviewer, for screenshots. |

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues on `Savar-G/unica-learning-landing-page`, through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, each label named as its role: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the root (created when needed); the existing decision log `.design/decisions.md` counts as the ADR record. See `docs/agents/domain.md`.
