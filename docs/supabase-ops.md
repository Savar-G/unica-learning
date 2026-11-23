# Supabase operations and schema conventions

Database: Supabase project `pagewise` (`cdjobwsyzndtltzfpyqa`, region `us-west-1`, next to Vercel `sfo1`). Base schema: `supabase/schema.sql`. Migrations: `supabase/migrations/`. Generated TypeScript types: `src/lib/database.types.ts` (type overrides in `src/lib/database.ts`, check constraints in `src/lib/database.checks.ts`).

For table-level behavior, read the generated types and the domain doc for that subsystem rather than duplicating schemas here.

## Migrations and generated types

- Apply database migrations yourself—do not ask Savar first.
- Name new files `supabase/migrations/<yyyymmddHHMMSS>_<name>.sql` (unique 14-digit UTC timestamp + snake_case name). Never rename older files; the folder is a historical record, not a clean bootstrap. Check `supabase_migrations.schema_migrations` for applied versions.
- Follow `supabase/migrations/README.md`: keep migrations additive so live code continues working between migration and deploy.
- Apply SQL with Supabase MCP `apply_migration` (or Management API using macOS Keychain item `supabase-pagewise` / `SUPABASE_ACCESS_TOKEN`). Verify with `list_migrations` and a probe query.
- After applying, run `npm run db:types` and commit `src/lib/database.types.ts` in the same PR. Never run `supabase login`. If the script fails, write the output of Supabase MCP `generate_typescript_types`.
- Never hand-edit `src/lib/database.types.ts`. Put jsonb / check-constraint overrides in `src/lib/database.ts` (`ColumnTypes`, `NullArgs`). Never add `overrideTypes`, `returns<T>()` or `maybeSingle<T>()` to queries.
- When adding or changing a `CHECK` constraint, also run `npm run db:checks` and commit `src/lib/database.checks.ts` (`src/lib/state-lists.test.ts` enforces parity; see `docs/state-machines.md`).

## Auth settings

- Confirm email is on. "Confirm signup" and "Magic link" templates show only the code `{{ .Token }}` with no link (`docs/assessment-signup.md`).
- Site URL: `https://unicalearning.com`. Google provider is on. Password reset template links to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`.
- Auth emails send via Resend SMTP (`smtp.resend.com:465`, key `supabase_auth_smtp`, sending-only).
- **Redirect allow-list:** `unicalearning.com`, `localhost:3000`, and exact preview aliases only—never a `*.vercel.app` wildcard. To test sign-in on a preview, add its shortened alias from `npx vercel@latest inspect`. Change Auth settings in the dashboard or Management API.

## Scheduled `pg_cron` jobs and Vault secrets

- **`assessment-reminders`** (every 15 min via `pg_net`): POSTs to Vault secret `reminders_url` with `Authorization: Bearer` + Vault secret `reminders_cron_secret` (matches Vercel `CRON_SECRET`). Optional Vault secret `reminders_vercel_bypass` reaches protected previews.
- **`scan-marking-recovery`** (every 15 min): POSTs to Vault secret `scan_marking_url` with `reminders_cron_secret`. Also sweeps abandoned Maya calls (`src/lib/maya-call-sweep.ts`, cursor in `public.maya_call_sweep_cursors`).
- Update Vault secrets with `vault.update_secret`; never commit them to migrations or git.
- Inspect runs in `cron.job_run_details` and HTTP responses in `net._http_response` (retained 6 hours).
- Keepalive: the free plan pauses after 7 days of inactivity, so Vercel's daily `/api/keepalive` cron calls `ping()`.

## Storage buckets and privacy boundaries

- **`shown-work`**: holds assessment drawings (`.png`) and whiteboard strokes (`<parent>/<assessment>/<question>-<random>.strokes.json`). Parents may read `.png` only; admins read strokes. Never include strokes in parent reports or anonymized copies (`public.anonymous_tests`).
- **`workbook-pages`**: private bucket holding rendered workbook PDFs, page images, proof images, and first-pages previews (`<parent>/<workbook-or-draft-id>/<name>`). Parents read only their own family's **shipped** workbooks (`workbooks_parent_shipped_only`); admins read all.
- **`curriculum-reference`**: private bucket holding masked reference page photos (`<source>/<level>/<sheet><side>.<ext>`), paired with `public.bank_reference_images`. Service-role only (no browser-role table grants or storage policies); not family data.
- Family deletion empties the family buckets (`docs/assessment-deletion.md`).

## Cross-cutting database conventions

- **Real vs test families:** `public.test_accounts` and `admin_team_ids()` identify test and team families. Admin metrics, queues, and digests exclude both unless `with_tests` is requested. Triggers refuse parent call notes (`maya_call_notes`) and `admin_test` Maya calls for mismatched family types.
- **Service-only write gates & row locks:** High-integrity writes go through service-only RPCs under row locks and family/child write fences (e.g., `create_family`, `claim_family_finish`, `issue_sign_in_link`, `submit_feedback`, `claim_pin_attempt`, `claim_contact_message`, `save_child_plan_state`, `admit_plan_start`, `write_workbook`, `append_maya_call_ink`).
- **Append-only ledgers:** `learning_events`, `skill_state_history`, `maya_call_connections`, `maya_call_ink_events`, `scan_mark_changes`, `workbook_second_tries` are append-only (triggers refuse updates where applicable).
- **Email send logging:** All outgoing emails go through `src/lib/email-delivery.ts` (Resend adapter `src/lib/email-resend.ts`, 15 s timeout, 600 ms pacing for Resend's 2 req/s free cap, Resend open/click tracking off). Tag every new email with a `log` kind in `src/lib/email-send-kinds.ts` (`public.email_sends`); secret kinds (sign-in links, delete codes, contact form) and the team digest store no copy, subject, or address.
- **Legacy unused objects (kept for rollout/worker compatibility):** `public.signups`, `public.signup_heard` (0 rows; retention worker still reads old bookings), `public.maya_minute_grants` and its triggers (unused since 2026-11-11), `admin_template_stats`, `admin_scan_team_queue`, `record_skill_state_changes`, `save_child_profile_and_skill_changes`, `save_maya_call_ink`, and older `child_card_updates` lock columns.

## Subsystem documentation map

| Subsystem | Doc |
|---|---|
| Signup & auth codes | `docs/assessment-signup.md` |
| Family deletion & retention | `docs/assessment-deletion.md` |
| Family time zones | `docs/family-postal-time.md` (`src/lib/family-time.ts`) |
| Parent dashboard, plan gate & billing | `docs/parent-dashboard.md`, `docs/stripe-webhook.md` |
| Workbooks, rendering & print contract | `docs/workbook-rendering.md`, `docs/workbook-worker.md`, `docs/first-pages.md` |
| Scans, crops & marking | `docs/scan-pages.md`, `docs/scan-marking.md`, `docs/scan-marking-escalation.md` |
| Maya chat, tutor, voice & spend | `docs/maya-chat.md`, `docs/maya-tutor.md`, `docs/maya-voice.md`, `docs/maya-spend.md` |
| Parent feedback | `docs/parent-feedback.md` |
| Traffic, ads & flyers | `docs/web-analytics.md`, `docs/ad-tracking.md`, `docs/flyer-tracking.md` |
| Team digest & monitoring | `docs/team-digest.md`, `docs/product-monitoring.md` |
| Reference records & bucket | `docs/reference-records.md` |
| State machines | `docs/state-machines.md` |
