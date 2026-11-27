# Unica Learning — Feature Map

Canonical map of user-facing and admin surfaces (`src/app/(site)` and `src/app/(product)`). Verified by `npm run check:guard` (`scripts/repo-guard.mjs`): every `page.tsx` route must appear here so agents share one vocabulary and stop hunting across files.

## Marketing (`src/app/(site)`)

| Feature | Route | Notes / Entry Docs |
| --- | --- | --- |
| Home / Landing | `/` | `DESIGN.md`, `docs/facts.md` |
| What's Included | `/whats-included` | Program overview |
| Curriculum | `/curriculum` | K–9 BC curriculum alignment |
| Math Assessment Landing | `/math-assessment` | Assessment explainer |
| Sample Report | `/sample-report` | Interactive sample diagnostic report |
| Pricing | `/pricing` | Plan pricing & BC launch (`docs/facts.md`) |
| Compare | `/compare` | Program comparison |
| Rewards | `/rewards` | Referral program (`docs/referrals.md`) |
| Our Story | `/our-story` | Brand & founder story |
| Contact | `/contact` | Contact form (`/api/contact`) |
| Blog Index | `/blog` | Weekly posts (`docs/blog-style.md`) |
| Blog Post | `/blog/[slug]` | `meta.updated` tracks copy changes (D-319) |
| Resources Index | `/resources` | Parent math guides |
| Resource Article | `/resources/[slug]` | Competitor mentions allowed here & `/blog` |
| Privacy Policy | `/privacy` | Only page naming AI/infrastructure providers |
| Terms of Service | `/terms` | Customer terms |

## Auth, Signup & Onboarding (`src/app/(product)`)

| Feature | Route | Key APIs / Docs |
| --- | --- | --- |
| Start / Signup | `/start` | `/api/account/*`, `docs/assessment-signup.md` |
| Getting Started | `/getting-started` | Onboarding landing |
| Sign In | `/sign-in` | Supabase auth (`docs/supabase-ops.md`) |
| Phone-to-Laptop Sign-In Link | `/sign-in/link` | One-time sign-in link (`SU5`) |
| Password Reset | `/sign-in/reset` | Recovery token flow (`SU4`) |
| Finish Account Setup | `/account/finish` | `/api/account/finish`, family admission (`SU2`) |
| Parent Goals Intake | `/account/goals` | Post-signup goals (D-325) |
| Maya Notice Consent | `/account/maya-notice` | `/api/account/maya-notice` (`DK6`) |
| Thank You | `/thank-you` | Post-signup confirmation |
| Unsubscribe | `/unsubscribe` | `/api/unsubscribe` |
| Family Deleted Confirmation | `/family-deleted` | `docs/assessment-deletion.md` |

## Placement Assessment (`src/app/(product)/account`)

| Feature | Route | Key APIs / Docs |
| --- | --- | --- |
| Assessment Start Screen | `/account/start/[child]` | `src/lib/assessment/attempt.ts` (`AS2`) |
| Child Placement Test | `/account/test/[childId]` | `/api/account/assessments/[id]/*`, `src/components/test.tsx` (`AS1`–`AS6`) |
| Diagnostic Report | `/account/report/[id]` | `src/lib/report-job.ts` (`AS8`) |

## Parent Dashboard (`src/app/(product)/account/(dashboard)`)

Primary docs: `docs/parent-dashboard.md`, `docs/plan-controls.md`, `docs/scan-pages.md`, `docs/referrals.md`.

| Feature | Route | Key APIs / Modules |
| --- | --- | --- |
| Parent Home | `/account` | `src/lib/parent-view.ts`, `src/lib/child-stage.ts` |
| Child Learning Overview | `/account/learning/[child]` | Skill states & mastery |
| Child Progress | `/account/progress/[child]` | `PROGRESS_TAB_ENABLED` |
| Child Workbooks List | `/account/workbooks/[child]` | Mailed workbooks & status |
| Workbook Detail | `/account/workbooks/[child]/book/[workbook]` | Pages, scan progress, delivery |
| Workbook Answer Key | `/account/workbooks/[child]/answers/[workbook]` | Parent answer key & explanations |
| Maya Parent Notes List | `/account/notes/[child]` | `docs/parent-maya-notes.md` |
| Maya Session Note Detail | `/account/notes/[child]/[session]` | Transcript & learning summary |
| Scan Workbook Pages | `/account/scan` | `/api/account/scans/*`, `src/components/scan-pages.tsx` |
| Scan Marking Results | `/account/scan/results/[id]` | `docs/scan-marking.md`, problem explanations |
| Plan & Billing | `/account/plan` | `src/lib/plan-access.ts`, Stripe controls |
| Referrals | `/account/referrals` | `docs/referral-implementation.md` |
| Weekly Schedule | `/account/schedule` | Practice schedule settings |
| Parent PIN Setup | `/account/pin` | `src/lib/parent-pin.ts` (`DK4`–`DK5`) |
| Password Settings | `/account/password` | Password management |
| Account Settings & Deletion | `/account/settings` | Family/child deletion (`MO11`–`MO13`) |
| Parent Feedback | `/account/feedback` | `docs/parent-feedback.md` |

## Child Desk & Maya Tutor (`src/app/(product)/tutor`)

Primary docs: `docs/maya-tutor.md`, `docs/maya-chat.md`, `docs/maya-voice.md`.

| Feature | Route | Key APIs / Modules |
| --- | --- | --- |
| Child Desk (Chat & Voice) | `/tutor` | `/api/desk/*`, `src/components/desk.tsx`, `src/lib/maya/session.ts` |
| QR Page Entry to Desk | `/tutor/p/[token]` | Printed workbook QR code deep-link |
| Forgot Parent PIN | `/tutor/forgot-pin` | `/api/desk/forgot-pin` |

## Admin Operations (`src/app/(product)/admin`)

> Never leave production admin pages open polling; inspect once, then close (`AGENTS.md`).

| Feature | Route | Domain / Purpose |
| --- | --- | --- |
| Admin Home | `/admin` | Entry & navigation |
| Admin Dashboard | `/admin/dashboard` | Funnel, metrics & ops summary |
| Next Steps Queue | `/admin/next-steps` | Actionable family queue |
| Activity Feed | `/admin/activity` | System events |
| Customer Activity | `/admin/customer-activity` | `docs/customer-activity.md` |
| Parents List | `/admin/parents` | Family directory |
| Parent Detail | `/admin/parents/[id]` | Plan start/controls, family history |
| Parent Dashboard Mirror | `/admin/parent-dashboard` | Admin preview of parent experience |
| Children List | `/admin/children` | Child directory |
| Child Detail | `/admin/children/[id]` | Child overview & actions |
| Child Profile | `/admin/children/[id]/profile` | Learner profile inspection |
| Child Preview Plan | `/admin/children/[id]/preview-plan` | Next-book plan preview |
| Child Preview Marks | `/admin/children/[id]/preview-marks` | `docs/workbook-preview-marks.md` |
| Child Snapshot Plan | `/admin/children/[id]/snapshot-plan` | `docs/next-book-snapshot.md` |
| Assessments / Tests List | `/admin/tests` | Placement test attempts |
| Assessment Detail | `/admin/assessments/[id]` | Answers, blocks, timing |
| Assessment Profile | `/admin/assessments/[id]/profile` | Profile derived from test |
| Report Detail | `/admin/reports/[id]` | Generated report inspection |
| Report Deck | `/admin/reports/[id]/deck` | Slide deck view |
| Workbooks List | `/admin/workbooks` | All workbooks & fulfillment |
| Workbook Detail | `/admin/workbooks/[id]` | Comments, edits, print & ship |
| Workbook Run Detail | `/admin/workbooks/runs/[id]` | Live/completed generation run (`docs/workbook-worker.md`) |
| Templates List | `/admin/templates` | Curriculum templates |
| Template Detail | `/admin/templates/[id]` | Template stats & QA |
| Skill Map | `/admin/skill-map` | Curriculum skill graph |
| Scans List | `/admin/scans` | Uploaded scans & escalation queue |
| Scan Detail | `/admin/scans/[id]` | Crops, calibration & marking inspection |
| Work Reviews | `/admin/reviews` | Human review queue |
| Maya Calls List | `/admin/maya` | Voice/chat call records |
| Maya Call Detail | `/admin/maya/[id]` | Transcript, board replay, flags |
| Maya Chat Families | `/admin/maya-chat` | Chat allowlist & rehearsal (`DK24`) |
| Emails List | `/admin/emails` | Send ledgers & webhook status |
| Email Detail | `/admin/emails/[id]` | Rendered copy & delivery events |
| Feedback Queue | `/admin/feedback` | Parent feedback submissions |
| Referrals Ops | `/admin/referrals` | Referral rewards & risk review |
| AI Usage & Costs | `/admin/ai` | `docs/ai-usage.md` |
| AI Per-Child Cost | `/admin/ai/children` | `docs/child-unit-cost.md` |
| Budget Ledger | `/admin/budget` | `docs/admin-budget.md` |
| Traffic Analytics | `/admin/traffic` | Site & ad traffic |
| Flyer Tracking | `/admin/flyers` | `docs/flyer-tracking.md` |
| System Health | `/admin/health` | `docs/product-monitoring.md` |
| Data Export | `/admin/export` | Operational exports |

## Background APIs, Webhooks & Crons (`src/app/api`)

| Surface | Path Prefix / Route | Key Docs |
| --- | --- | --- |
| Parent & Account APIs | `/api/account/*` | Auth, assessments, scans, plan, feedback |
| Desk & Maya APIs | `/api/desk/*` | Chat, board ink, voice token, PIN |
| Admin APIs | `/api/admin/*` | Operations, workbook runs/edits, scans |
| Stripe Webhook | `/api/stripe-webhook` | `docs/stripe-webhook.md` |
| Resend Webhook | `/api/resend-webhook` | Email delivery events (`AS17`) |
| OpenRouter Usage Webhook | `/api/openrouter-usage` | `docs/openrouter-usage-webhook.md` |
| Scheduled Jobs / Workers | `/api/reminders`, `/api/scan-cleanup`, `/api/scan-marking`, `/api/scan-progress`, `/api/workbook-emails`, `/api/next-book-prepare`, `/api/child-deletions`, `/api/keepalive` | `docs/supabase-ops.md` |
| Async Recovery Endpoints | `/api/first-pages/[id]/run`, `/api/report-jobs/[id]/retry`, `/api/workbook-runs/[id]/resume`, `/api/workbook-render-check` | Worker & job recovery |
| Workbook v2 Publish Check | `/api/workbook-v2-publish` | Builds and publishes the full-size invented v2 book for a test family (CRON_SECRET; off in production unless `WORKBOOK_V2_TEST_PUBLISH=on`; `docs/workbook-v2-engine.md`) |
| Marketing / Tracking | `/api/contact`, `/api/visit`, `/api/visit/step`, `/api/hit`, `/api/unsubscribe` | `docs/ad-tracking.md`, `docs/web-analytics.md` |
