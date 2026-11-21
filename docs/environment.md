# Environment variables reference

Complete reference for application, worker, and script environment variables. Copy `.env.example` to `.env.local` for local development. Production and Preview values live in Vercel (`unica-learning-landing-page`, team `unica-learning`); Mac worker settings live in `~/.config/unica/workbook-worker.env`; LiveKit voice worker secrets live in LiveKit Cloud (`docs/maya-voice-deploy.md`).

## Core, Supabase, and Auth

| Variable | Used by / Notes |
|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Server-only (`src/lib/supabase.ts`). Default to `src/lib/supabase-public.ts`. Override client defaults with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. |
| `SUPABASE_SECRET_KEY` | Server-only (`src/lib/supabase-auth.ts`). Privileged writes for parent accounts and RPCs. Never sent to the browser. |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ALLOW_INDEX` | Canonical URL for share cards and links; search indexing switch (`false` locally and on previews). |
| `CRON_SECRET` | Protects `/api/keepalive`, `/api/reminders`, `/api/scan-marking`, `/api/child-deletions`, and workbook resume routes. Production and Preview. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Set by Vercel. Sent by internal follow-up requests (workbook run resume, report retry, first pages) to reach protected deployments. |
| `NEXT_PUBLIC_BOOKING_URL` | Cal.com link for the free 15-minute results call (`src/lib/contact.ts`). Optional: unset defaults to `https://cal.com/unicalearning/15min`; empty string hides both report card and email link. Accepts only `cal.com` and `calendly.com` URLs. |
| `ONBOARDING_WALKTHROUGH_URL` | Optional HTTPS dispatch video link; blank omits it from dispatch emails. |

## Email (Resend)

| Variable | Used by / Notes |
|---|---|
| `RESEND_API_KEY` | Required for all outgoing email via `src/lib/email-resend.ts`. |
| `EMAIL_FROM` | Parent email sender: `Unica Learning <contact@unicalearning.com>` (Production and Preview). Without it, emails do not send. |
| `SIGNUP_NOTIFY_EMAIL` | Team alert recipient (report alerts, Maya safety alerts, daily scan count email, daily team digest, cancellation alerts). |
| `RESEND_WEBHOOK_SECRET` | Server-only signing secret (`whsec_...`) for `https://unicalearning.com/api/resend-webhook` (events: delivered, delayed, bounced, complained, failed, suppressed). Production. Unset returns `503`. |

## Billing (Stripe)

| Variable | Used by / Notes |
|---|---|
| `STRIPE_SECRET_KEY` | Server-only. Needs write access to Customers, Checkout Sessions, Subscriptions, Products, Prices, Coupons; read access to SetupIntents, PaymentMethods, Invoices, Customers, Subscriptions. Verify restricted keys on preview. |
| `STRIPE_WEBHOOK_SECRET` | Server-only signing secret (`whsec_...`) for `https://unicalearning.com/api/stripe-webhook` (`docs/stripe-webhook.md`). Production. Unset returns `503` and no plan state updates. |

## AI Product Keys and Models

> **Strict isolation (`src/lib/ai-product-keys.ts`, `docs/ai-product-keys.md`):** Each product requires its own distinct OpenRouter key in the Unica Learning workspace. Shared `OPENROUTER_API_KEY` and `DECISIONS_OPENROUTER_API_KEY` do **not** enable model calls. A missing key disables that product; duplicate keys across products disable **all** product clients.

| Variable | Used by / Notes |
|---|---|
| `MAYA_OPENROUTER_API_KEY` | Maya chat/voice tutoring, free-talk review, math review, call notes. Required by web app and voice worker. |
| `SCAN_MARKING_OPENROUTER_API_KEY` | Scan marking and upload photo checks (`DECISION_MODEL`). |
| `PARENT_EXPLANATION_API_KEY` | Parent problem explanations (`docs/parent-problem-explanations.md`). No fallback. |
| `WORKBOOK_OPENROUTER_API_KEY` | Workbook writing, solve checks, and workbook question gates. Required by Mac workbook worker when falling back to API. |
| `ASSESSMENT_OPENROUTER_API_KEY` | Assessment reports and AI work reviews. |
| `PROFILE_OPENROUTER_API_KEY` | Learner profile AI parts and child profile AI findings (profiles keep factual data when absent). Used by web app, voice worker, and workbook worker. |
| `AI_MODEL` | Default OpenRouter model id across AI features; default `anthropic/claude-sonnet-5.5` (requires image input, structured output, reasoning). |
| `AI_SOLVE_MODEL` | Workbook generator solve-check model (`src/lib/workbook-solve-check.ts`); default `anthropic/claude-haiku-5.5`. Sample CLI with `--anthropic` uses `ANTHROPIC_SOLVE_MODEL` (`claude-haiku-5-5`). |
| `DECISION_MODEL` | Decision client model (`src/lib/decision-client.ts`, default `typesafe/jev-1.14`). Used for photo checks (`SCAN_MARKING_OPENROUTER_API_KEY`) and workbook gates (`WORKBOOK_OPENROUTER_API_KEY`). |
| `MAYA_REVIEW_MODEL` | Maya free-talk review model (D-197); default `anthropic/claude-haiku-5.5`. |
| `MAYA_MATH_REVIEW_MODEL` | Tutor core math-truth review model (`docs/maya-tutor.md`); default `anthropic/claude-haiku-5.5`. Site and voice worker. |
| `MAYA_MATH_REVIEW_RETRY_MODEL` | Retry model when math review answers "unsure"; default `anthropic/claude-sonnet-5.5`. Site and voice worker. |
| `SCAN_MARKING_MODEL` | Optional model override for scan marking (`docs/scan-marking.md`). |

## Feature Switches and Rollout Controls

All switches fail closed unless set to the exact value documented below. Do not enable production family-facing switches without Savar's approval.

| Variable | Behavior |
|---|---|
| `PARENT_DASHBOARD_ENABLED` | Exact `on` opens the parent dashboard to all families (`docs/parent-dashboard.md`). Otherwise open only to `test_accounts`, `admin_users`, and children with an open plan (`src/lib/plan-access.ts`). |
| `PROGRESS_TAB_ENABLED` | Exact `on` shows the Progress tab and `/account/progress/<child>` to dashboard-eligible families; otherwise hidden/404. Keep off until skill map review (#194). |
| `MONTHLY_SUMMARY_EMAIL_ENABLED` | Exact `on` lets `/api/reminders` send monthly summaries (only to `dashboardSwitchOpen` families, never plan-gate-only). Off by default. |
| `FIRST_PAGES_ENABLED` | Exact `on` lets the report job queue Workbook 1 first pages for eligible BC tests (`docs/first-pages.md`). On in Production since 2026-11-11. |
| `FIRST_PAGES_EMAIL_ENABLED` | Exact `on` lets `/api/reminders` send the first-pages sample PDF email. On in Production since 2026-11-11. |
| `SCAN_PAGES_ENABLED` | Exact `on` opens page scanning to all signed-in families (`docs/scan-pages.md`); otherwise test families and admins only. |
| `SCAN_MARKING_ENABLED` | Unset = off; `test-only` or `families` (`docs/scan-marking.md`). |
| `SCAN_MARKING_TEST_PARENT_IDS` | Optional allow-list for `test-only` marking; malformed list closes marking for everyone. |
| `SCAN_MARKING_ESCALATION` | Exact `on` sends unsure scan answers once to Claude Opus 5.5 (Anthropic then Azure global, never Google) before team review (`docs/scan-marking-escalation.md`). Requires enabled `anthropic/claude-opus-5.5` row in `scan_marking_prices`. |
| `SCAN_TEAM_EMAIL_ENABLED` | Exact `on` sends one daily 8 a.m. Pacific team email to `SIGNUP_NOTIFY_EMAIL` with waiting real-family scan count (`src/lib/scan-team-email.ts`). |
| `TEAM_DIGEST_EMAIL_ENABLED` | Exact `on` sends the daily 7 a.m. Pacific team digest to `SIGNUP_NOTIFY_EMAIL` (`docs/team-digest.md`). |
| `WORKBOOK_SCAN_PROGRESS_ENABLED`, `WORKBOOK_SCAN_REMINDERS_ENABLED`, `WORKBOOK_SCAN_TEST_PARENT_IDS`, `NEXT_BOOK_PREPARE_ENABLED` | Scan progress, inactivity reminders, and next-book prep (`docs/workbook-scan-progress.md`, `docs/next-book-snapshot.md`). Off when unset. Reminders `families` requires progress `families` and reads no plan gate. |
| `MAYA_TUTOR_FAMILIES` | Exact `on` enables the tutor core for family desk chat and voice calls (`docs/maya-tutor.md`, `src/lib/maya-call-seams.ts`). On in Production and voice worker secrets since 2026-11-15. Admin test calls always use tutor core. |
| `MAYA_CHECKED_ADDITION` | Exact `on` alongside `MAYA_CHECKED_EXCHANGE=on` enables checked two-digit addition with one regrouping step for new tutor sessions. Off when unset. |
| `MAYA_CHAT_ENABLED` | Unset: open-plan children + test families. Exact `on`: also families on the admin chat list with a running plan. Exact `off`: emergency stop for all non-test families (`docs/maya-chat.md`). |
| `RENDER_CHECK` | Exact `on` opens `/api/workbook-render-check` in production (`docs/workbook-rendering.md`). Off otherwise. |
| `ASSESSMENT_COMPARISON_EXCLUDED_EMAILS` | Comma-separated test emails excluded from assessment comparison (`docs/assessment-comparison.md`). |

## Workbooks and Mac Worker

| Variable | Used by / Notes |
|---|---|
| `WORKBOOK_RUNNER` | `mac` (default, Production): queues runs for Savar's Mac worker (`docs/workbook-worker.md`). `server`: runs on Vercel via API. |
| `WORKBOOK_AI_PRIMARY` | `subscription` (default) or `api` for Mac worker and `npm run workbooks:samples`. |
| `WORKBOOK_CLAUDE_MODEL`, `WORKBOOK_CLAUDE_SOLVE_MODEL`, `WORKBOOK_CLAUDE_CONFIG_DIR`, `WORKBOOK_CLAUDE_COMMAND`, `WORKBOOK_CLAUDE_TIMEOUT_MS` | Mac worker `claude -p` settings (`src/lib/workbook-ai.ts`; defaults `claude-sonnet-5-5`, `claude-haiku-5-5`, `~/.claude`, `claude`, `300000` ms). Set in `~/.config/unica/workbook-worker.env`, never in Vercel. |
| `WORKBOOK_SUBSCRIPTION_PROVIDER`, `WORKBOOK_CODEX_HOME`, `WORKBOOK_WORKER_ID`, `CHROMIUM_PATH` | Mac worker only (`docs/workbook-worker.md`): `claude` (default) or `codex`, Codex folder (required for `codex`), worker heartbeat name, Chrome path. |
| `WORKBOOK_AI_FAKE`, `WORKBOOK_CALL_BUDGET_MS` | Development only: `WORKBOOK_AI_FAKE=on` (or `slow`) runs free fake AI + solve checks; `WORKBOOK_CALL_BUDGET_MS` shortens per-call budget. |

## Maya Voice (LiveKit) and Spend Caps

| Variable | Used by / Notes |
|---|---|
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Server-only. Web app mints 5-min call tokens and shows the Speak option only when all three are set. Voice worker uses LiveKit-injected values (`docs/maya-voice.md`, `docs/maya-voice-deploy.md`). |
| `MAYA_STT`, `MAYA_TTS` | Voice worker only: `fake`, `inference`, `assemblyai` (STT) / `inworld` (TTS). |
| `MAYA_USD_TO_CAD`, `MAYA_MONTHLY_ALERT_CAD`, `MAYA_STT_USD_PER_MINUTE`, `MAYA_VOICE_USD_PER_1K_CHARS` | Maya spending estimates and monthly CAD alert threshold (`docs/maya-spend.md`; defaults `1.40`, `400`, `0.01`, `0.03`). Site and voice worker. |

## Observability, Analytics, and Ads

| Variable | Used by / Notes |
|---|---|
| `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ENABLED`, `NEXT_PUBLIC_SENTRY_ENABLED` | Sentry (`docs/sentry.md`). Auth token uploads source maps in Production builds. DSN overrides `src/lib/sentry-options.ts` (empty disables). Local runs require `SENTRY_ENABLED=on` / `NEXT_PUBLIC_SENTRY_ENABLED=on`. |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_UI_HOST`, `NEXT_PUBLIC_POSTHOG_INGEST` | PostHog client and `/ingest` proxy (`src/instrumentation-client.ts`). Logs to console in dev when key is unset. |
| `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST` | Server-only for `/admin/traffic` HogQL queries (`src/lib/posthog-traffic.ts`; defaults `650128`, `https://us.posthog.com`). |
| `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GOOGLE_ADS_ID`, `NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL`, `NEXT_PUBLIC_GOOGLE_ADS_REPORT_LABEL`, `NEXT_PUBLIC_GOOGLE_ADS_CARD_LABEL` | Ad tags (`src/lib/ad-tags.ts`, `docs/ad-tracking.md`). Optional; load only after cookie consent, never on child test/desk/QR pages. |

## Development-Only Fakes (Ignored in Production)

| Variable | Behavior |
|---|---|
| `PHOTO_CHECK_FAKE` | `blurry` or `clear`: simulates photo check after 1.5 s for UI screenshots. |
| `AI_REVIEW_FAKE` | `sure` or `unsure`: simulates report job AI reviewer and profile AI findings for screenshots. |
