<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Pagewise landing page - working conventions

Personalized, mailed math and reading workbooks for ages 6-12 (grades 1-7). Design truth: `DESIGN.md`. Decision history: `.design/decisions.md`.

## Agent rules

- Apply database migrations yourself. Do not ask Savar first. Write the SQL to `supabase/migrations/<yyyymmdd>_<name>.sql`, apply it with the Supabase MCP `apply_migration` (project `cdjobwsyzndtltzfpyqa`), and verify it with `list_migrations` and a probe query. Apply it before the code that needs it ships. Keep migrations additive, so the live code keeps working in between.
- Open a pull request yourself when you finish building something. Do not ask first. Use a branch named `site/<topic>`, from a worktree based on `origin/main`. Merging to `main` deploys production, so leave the merge to Savar unless he asks.
- Never switch branches in the main checkout. Other agents work in parallel worktrees (`git worktree list`).
- All design work goes through `/design`. Mockup rounds live in `.design/experiments/r<n>/`, with a `manifest.json`.
- Done gate (no test suite): `npx eslint src && npm run build`, then check the change in the browser with `npm run dev`. `npm run lint` also scans `.design-sync/previews/`, which has old errors.
- Copy rules in `DESIGN.md` are binding: no proof we do not have, no competitor names, no performance claims.

## Tools and services

| Tool | What we use it for | Notes |
|---|---|---|
| Next.js 16 + React 19 (TypeScript) | The site and its API routes (`src/app`) | Read `node_modules/next/dist/docs/` before you write Next.js code. Design-system components live in `src/ds` (`npm run build:ds` builds `dist/ds`). |
| Vercel | Hosting, preview deploys, daily cron | Project `ai-workbooks-landing-page`, team `team_FGQkGyJkN7E0rgmxUsvC2ZDL`. Pushes to `main` deploy production. Placeholder domain: `pagewiselearning.vercel.app`. Cron `/api/keepalive` runs daily at 15:00 UTC (`vercel.json`). The claude.ai Vercel connector cannot see this project; use `npx vercel@latest` (CLI login `savargupta1922-1024`). |
| Supabase | Postgres store for signups and waitlist entries | Project `pagewise` (`cdjobwsyzndtltzfpyqa`). Table `public.signups`; the site can only insert (RLS). The free plan pauses after 7 days without activity, so the keepalive cron calls `ping()`. Base schema: `supabase/schema.sql`; changes: `supabase/migrations/`. |
| PostHog | Product analytics and the signup funnel | Loads after the page is idle (`src/instrumentation-client.ts`). Events go through the `/ingest` proxy (`next.config.ts`) so ad blockers do not drop them. Event names: `src/lib/track.ts`. A signup identifies the parent by email. PostHog MCP is available for queries. |
| Resend | Emails Savar about each new signup | Sent from `/api/signup` after the response. The free plan sends only from `onboarding@resend.dev` to the account owner. Emails to parents need a verified domain that we own. |
| Stripe | Refundable deposit for BC-curriculum signups | A Payment Link (`STRIPE_DEPOSIT_LINK`). `/api/signup` adds `prefilled_email` and `client_reference_id` (= `signups.ref`). The link's after-payment redirect must be `<site>/?deposit=paid`. The link's amount must equal `DEPOSIT` in `src/lib/site.ts`. Stripe is the record of who paid; Supabase does not know. |
| GitHub | Repo `Savar-G/pagewise-landing-page`, pull requests | Use the `Savar-G` account in `gh`. |

## Environment variables

| Variable | Used by |
|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | `src/lib/supabase.ts` (server only) |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_UI_HOST`, `NEXT_PUBLIC_POSTHOG_INGEST` | PostHog client and proxy. Without the key, events log to the console in dev. |
| `RESEND_API_KEY`, `SIGNUP_NOTIFY_EMAIL` | Signup alert emails |
| `CRON_SECRET` | Protects `/api/keepalive` |
| `STRIPE_DEPOSIT_LINK` | Stripe Payment Link for the BC deposit. Without it, BC parents see "we'll email you a payment link" and the signup alert says to send one. |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ALLOW_INDEX` | Share-card links; search indexing switch |
