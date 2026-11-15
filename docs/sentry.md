# Sentry

Sentry tells the team when the site, a scheduled job or an AI call fails or is slow. We use it for errors, traces, logs,
cron monitors, AI monitoring, uptime checks and Session Replay on errors. We got into Sentry for Startups on 2026-11-15:
USD 5,000 in credits, which end on 2027-11-15.

- Organization: `unica-learning` (US region, `https://unica-learning.sentry.io`).
- Project: `unica-web` (platform `javascript-nextjs`). The DSN is in `src/lib/sentry-options.ts` (`SENTRY_DSN`). A DSN only
  lets a client send events, so it is public by design.
- SDK: `@sentry/nextjs` 11 (exact version in `package.json`), with `@sentry/replay` loaded as its own chunk.

## What goes to Sentry

| Feature | Where | Settings |
|---|---|---|
| Errors | Browser, Node server, edge | `src/instrumentation.ts` (`onRequestError`), `src/instrumentation-client.ts`, `src/app/error.tsx` |
| Traces | Every server request (100%), a tenth of browser page loads | `tracesSampleRate` in `sharedOptions`. Spans stream in batches (SDK 11). |
| Logs | Server `console.warn` and `console.error` | `consoleLoggingIntegration` in `src/instrumentation.ts`. `info` and `log` lines stay in Vercel only. |
| Cron monitors | 8 scheduled routes, the retention workflow, the Mac workbook worker | Below |
| AI monitoring | Every OpenRouter request | `src/lib/ai-observe.ts`: one `gen_ai.chat` span per request with the feature (`gen_ai.agent.name`), model, tokens and cost; metrics `ai.cost` (USD), `ai.tokens`, `ai.failures`. |
| Uptime | `https://unicalearning.com/`, `/start` | Uptime monitors in Sentry, every 5 minutes. |
| Session Replay | Browser, on error only | `src/lib/sentry-replay.ts`, below |

Sentry sends only from a Vercel deployment (production or preview). A local `next dev` sends nothing unless
`SENTRY_ENABLED=on` (server) or `NEXT_PUBLIC_SENTRY_ENABLED=on` (browser). `NEXT_PUBLIC_SENTRY_DSN=""` turns Sentry off
everywhere.

## Privacy rules

Children use this site, so Sentry gets no personal values and no child work. Two layers do this:

1. **The SDK collects less.** SDK 11 collects request bodies, cookies, headers, query strings, AI prompts and answers,
   and database data by default. `DATA_COLLECTION` in `src/lib/sentry-options.ts` turns every one of them off.
   Do not remove a key from it: an omitted key means "collect".
2. **Everything is scrubbed before it leaves** (`src/lib/sentry-scrub.ts`, tested in `sentry-scrub.test.ts`):
   - Addresses lose their query and hash. QR tokens, scan pages and admin records are replaced, as in analytics
     (`src/lib/url-tokens.ts`).
   - Emails, bearer values and long tokens in any text become `[email]`, `[token]`.
   - Errors keep no request body, cookie, query, private header, stack frame variable or console breadcrumb.
     The user keeps only our own id, never an email, a name or an IP address.
   - Logs keep the cleaned message only, not the printed arguments.
   - Spans lose AI input and output, database statements, bodies and headers.

The browser sends to Sentry through `/monitoring` on our own site (`tunnelRoute` and `src/app/sentry-tunnel/route.ts`).
The tunnel sends only the payload, so Sentry never sees a visitor's IP address, and ad blockers do not drop error reports.

Errors and traces from the browser set no cookie and hold no identifier, so they do not wait for the cookie choice.

### Session Replay

- Loads only after the visitor accepts optional cookies (`src/lib/consent.ts`), as PostHog does.
- Never records the child's pages, the scan pages, or the admin area (`replayAllowed`: `/tutor`, `/account/test`,
  `/account/start`, `/account/scan`, `/admin`, and any address that may carry a QR token).
- Keeps only the last minute in the browser and sends it only when an error happens, for half of the errors
  (`replaysOnErrorSampleRate: 0.5`). It never records a whole visit (`replaysSessionSampleRate: 0`).
- Masks all text and inputs, and blocks images, video and canvas. No network details.
- A move to a blocked page, or a withdrawn consent, stops it at once and sends nothing it held (`stop({ flush: false })`).

The privacy page (`/privacy`) describes the recordings and names Sentry. Change it when any rule here changes.

## Cron monitors

Each scheduled route is wrapped with `monitored(slug, handler)` (`src/lib/sentry-cron.ts`). Only a call with the right
`CRON_SECRET` checks in, and `?dry=1` does not. A 5xx answer or a throw is a failed run. The schedule goes with each
check-in, so Sentry creates and updates the monitor from `CRON_MONITORS`. When you add or change a schedule (pg_cron,
`vercel.json`), change `CRON_MONITORS` in the same commit.

| Monitor | Caller | Schedule (UTC) |
|---|---|---|
| `reminders`, `next-book-prepare`, `scan-cleanup`, `scan-progress` | pg_cron | every 15 minutes |
| `scan-marking` | pg_cron every 15 minutes, and Vercel daily | every 15 minutes |
| `workbook-emails` | pg_cron | 7, 22, 37, 52 past each hour |
| `keepalive`, `child-deletions` | Vercel cron | 15:00, 15:15 |
| `family-retention` | GitHub workflow `retention.yml` (scheduled runs only) | 15:17 |
| `workbook-worker` | The Mac worker, every 5 minutes (`scripts/workbook-worker.ts`) | heartbeat |

The last two check in over HTTP (`sentryCheckInUrl`) and were created through the Sentry API. `workbook-worker` opens an
issue after 1 hour with no check-in, so it also opens one when the Mac sleeps for the night.

## Source maps and releases

`withSentryConfig` in `next.config.ts` uploads the source maps during the Vercel build and deletes them from the
deployment. It needs `SENTRY_AUTH_TOKEN` (an organization token, Vercel Production only). Without the token the build
still passes and the stack traces stay minified. The release is the commit SHA.

## For agents

- Read issues, traces and logs with the Sentry MCP (`https://mcp.sentry.dev/mcp`). The first use asks to sign in with
  `/mcp`.
- Use `Sentry.logger.*` or `console.warn`/`console.error` for a new log. Never put a child's work, a name or an email in
  a log line: the scrubber hides emails and tokens, not names.
- New AI calls through `openRouterClient` get a span by themselves. Pass `feature` so the AI view groups them.
