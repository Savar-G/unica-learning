# First delivery runbook

This runbook takes one family from "the parent saved a card" to "the free month started". A new team member can follow it. The team runs it once for the first paying customer, records what happens in the run log at the end, and later turns it into an agent skill.

Spec: GitHub #932 and its tickets #933 to #937 (`Savar-G/unica-learning`). Those tickets prove the release. This runbook is the procedure for the real delivery.

Written from the code at commit `4d47b0720` (origin/main, 2026-11-14). Each step names its source files. A later agent must check each source again before it trusts a step. Where a doc and the code disagree, this runbook follows the code and lists the mismatch in "Mismatches found".

## Who does what

| Who | Does |
|---|---|
| Parent | Finishes the test, saves a card, receives the workbook, scans pages. |
| Admin (Luis, Savar) | Uses the admin pages. Every admin route checks a live admin session and the site's origin. |
| Worker on Savar's Mac | Writes and renders the workbook. It runs as the LaunchAgent `com.unicalearning.workbook-worker`. |
| Savar | Approves print, approves any real-family email, starts the plan, owns Vercel and Stripe settings. |

## The path at a glance

| # | Step | Who |
|---|---|---|
| 1 | Parent saves a card on the report | Parent |
| 2 | Welcome email goes out | System |
| 3 | Check the shipping address | Admin |
| 4 | Prepare Book 1 | Admin, worker |
| 5 | Review the draft and approve for print | Admin (Savar says go) |
| 6 | Print, check the paper copy, mark printed | Admin |
| 7 | Send the "Workbook ready" email | Admin |
| 8 | Mail or hand over the workbook | Team |
| 9 | Send the delivery email, mark shipped | Admin |
| 10 | Confirm delivery | Admin |
| 11 | Start the plan | Admin (Savar says go) |
| 12 | Check what the parent sees | Admin |
| 13 | Day 30: first charge | System |

## Before you start

Do each check. Write the result in the run log. If a check fails, stop and fix it first.

- [ ] **Worker heartbeat is alive.** Open `/admin/workbooks`. The page must show "Workbook computer online". The worker is online when its last heartbeat is 90 seconds old or less (`WORKER_ONLINE_MS`, `src/lib/workbook-worker.ts`). Read-only check: `select id, seen_at, note, run_id, build from public.workbook_workers order by seen_at desc limit 3;`. On the Mac: `tail -n 20 ~/Library/Logs/unica-workbook-worker.log`. Restart with `launchctl kickstart -k gui/$(id -u)/com.unicalearning.workbook-worker`. Keep the Mac lid open and on power while a run works (`docs/workbook-worker.md`).
- [ ] **Worker settings are right.** `~/.config/unica/workbook-worker.env` names the Claude account to use. The Mac has Google Chrome (or `CHROMIUM_PATH`). The worker runs the code of `origin/main`.
- [ ] **`WORKBOOK_RUNNER` is `mac` or unset** in Vercel Production. With `server`, the site makes the run itself with the paid API.
- [ ] **Savar confirms these flags in Vercel Production.** Ask for the values. Do not pull or print secrets.
  - `PARENT_DASHBOARD_ENABLED`: unset or `on`. Either way, a child with an open plan gets the dashboard.
  - `SCAN_PAGES_ENABLED`: a child with an open plan has scanning with no switch.
  - `SCAN_MARKING_ENABLED`: `test-only` means a real family's pages are not marked automatically. Do not change it (see "Stop and ask Savar").
  - `FIRST_PAGES_ENABLED`, `FIRST_PAGES_EMAIL_ENABLED`, `WORKBOOK_SCAN_REMINDERS_ENABLED`, `MONTHLY_SUMMARY_EMAIL_ENABLED`: know the value of each. Each one controls an email that can reach a real parent.
- [ ] **Stripe is in live mode.** Savar confirms that `STRIPE_SECRET_KEY` in Production is a live key (`sk_live_` or `rk_live_`). Never print the key. The Stripe dashboard must show live mode (not test mode) for this customer. A test-mode customer on a live key fails every read with `resource_missing` (`docs/stripe-webhook.md`).
- [ ] **The Stripe webhook is active.** The destination `https://unicalearning.com/api/stripe-webhook` exists and its recent events answer 204 (`docs/stripe-webhook.md`). Without it, plan state is kept only by the daily re-read.
- [ ] **Email can send.** `RESEND_API_KEY`, `EMAIL_FROM` (`contact@unicalearning.com`) and `SIGNUP_NOTIFY_EMAIL` are set. The admin route answers 503 `unavailable` when they are not (`src/app/api/admin/cards/[id]/workbook-email/route.ts`).
- [ ] **An address is on file.** The family's shipping address is in Stripe (step 3). The site stores only the postal code.
- [ ] **The family is a real family, not a test family.** Admin lists hide test families unless "Show test families" is on. A real run must not use a test family, and a test run must not use a real one.
- [ ] **No one else changes this family.** No open pause, cancel or restart for the child (see step 4, "Common failures").

## Stop and ask Savar

Stop. Ask Savar in writing. Wait for a clear yes before you go on.

- Any step that moves money. This includes **Workbook delivered: start plan** (step 11): it creates a live Stripe subscription that charges CAD 79.99 on day 30. It includes any Restart or card change.
- Any email to a parent outside the normal flow: the welcome, the "Workbook ready" email, the delivery email, and the plan start confirmation. Any other email, or any resend, needs Savar. A resend of an email in state `unknown` needs Savar (see step 2).
- **Approve for print** on a real family's book (step 5). #932 does not authorize print approval, so Savar decides.
- Any change to a Vercel variable or release switch, especially `SCAN_MARKING_ENABLED`, `SCAN_PAGES_ENABLED`, `PARENT_DASHBOARD_ENABLED`, `FIRST_PAGES_*`, `WORKBOOK_RUNNER`, and any `*_EMAIL_ENABLED` switch.
- **Run on the server with the API** on a run page. It spends API money.
- Any step that says "unknown" about money: a start answer `unconfirmed`, `needs_team` or `failed`, a plan state `unknown`, or a Stripe subscription you did not expect. Do not press Start again.
- A real-family result that does not match the printed book (wrong name, wrong page, wrong answer).
- Anything in Stripe, Supabase or Vercel that you must write by hand.

## Step 1. The parent saves a card on the report

- **Who:** Parent.
- **Where:** The report page. The button reads "Start plan" (`reportButton`, `src/lib/family-plan-words.ts`).
- **What the system does:**
  - `POST /api/account/card` (`src/app/api/account/card/route.ts`) calls `startCard` (`src/lib/next-step-server.ts`). It opens a Stripe Checkout page in setup mode. Nothing is charged.
  - The parent returns to `/thank-you?...&from=report` (`src/app/(product)/thank-you`). The page confirms the card with Stripe. The saved-card module (`src/lib/saved-card.ts`) decides whether a card is saved.
  - Tables written: `public.card_setups` (`card_saved_at`, `stripe_customer_id`). Plan state stays `not_started`. The product is not open yet (`docs/parent-dashboard.md`, "The plan gate": the report's button only saves a card).
  - If the parent closed Checkout without returning, the worker route `/api/workbook-emails` finds a confirmed Stripe card later (2 card setups per run; `docs/workbook-delivery-emails.md`).
- **Check it worked:**
  - Admin page `/admin/next-steps`, section "All saved cards": the card shows as saved.
  - Read-only SQL: `select id, child_id, card_saved_at, stripe_customer_id is not null as has_customer from public.card_setups where child_id = '<child id>';`
- **Common failure and fix:**
  - The parent sees "later" instead of the Stripe page: Stripe is off or failed (`src/app/api/account/card/route.ts` comment). Ask Savar to check `STRIPE_SECRET_KEY`.
  - `card_saved_at` is empty after the parent says they saved it: wait for the next `/api/workbook-emails` run (minutes 7, 22, 37 and 52 of each hour), then check Stripe for the Customer. If still empty, stop and ask Savar.
- **Sources:** `src/app/api/account/card/route.ts`, `src/lib/next-step-server.ts`, `src/lib/saved-card.ts`, `docs/parent-dashboard.md`, `docs/workbook-delivery-emails.md`.

## Step 2. The welcome email goes out

- **Who:** System. The admin only checks.
- **Where:** `/admin/next-steps`, the family's card, "Workbook emails".
- **What the system does:**
  - The card confirmation transaction queues one welcome per saved card. The thank-you handler tries to send it. The Supabase job `workbook-welcome-emails` (minutes 7, 22, 37, 52) calls `/api/workbook-emails` and sends the rest (`src/app/api/workbook-emails/route.ts`, `src/lib/workbook-email-server.ts`).
  - The email asks the parent to allow 5 to 7 days for Workbook 1 and says another email follows.
  - Table written: `public.workbook_emails` (kind `welcome`, one key per saved card).
  - A card saved before the automation shipped has automatic welcomes off. Send it by hand: "Preview welcome email", then "Send welcome email" (`src/components/workbook-emails.tsx`). This is a real-parent email: ask Savar first.
- **Check it worked:**
  - The card's Workbook emails history shows the welcome as sent.
  - Read-only SQL: `select kind, workbook_number, status, attempts, sent_at, error from public.workbook_emails where card_setup_id = '<card id>' order by created_at;`
  - The email text is in `/admin/emails`.
- **Common failure and fix:**
  - Status `failed` (a definite refusal): at most 3 automatic tries. The card shows under "Workbook emails to check" on `/admin/next-steps`. The admin can retry explicitly after Savar says yes.
  - Status `unknown`, or `sending` for 10 minutes or more: the provider result is uncertain. **Do not send again.** Check the email in Resend first. Ask Savar.
  - Route answers 503: email settings are missing. Ask Savar.
- **Sources:** `docs/workbook-delivery-emails.md`, `docs/workbook-email-copy.md`, `src/components/workbook-emails.tsx`, `src/app/api/admin/cards/[id]/workbook-email/route.ts`.

## Step 3. Check the shipping address

- **Who:** Admin.
- **Where:** `/admin/next-steps`, the child's card, link "Open in Stripe". In Stripe, open the Customer and read "Shipping details".
- **What the system does:** Nothing. The site does not store a mailing address. Only the postal code is in `public.parents`.
- **Check it worked:** The Customer has a shipping address. A billing address is not a shipping address.
- **Common failure and fix:** No shipping address in Stripe. Ask the parent for it before you mail. Write it in a private place, not in this repo or in a ticket.
- **Sources:** `src/components/admin-plans.tsx` ("How a plan starts"), `src/components/admin-family.tsx`.

## Step 4. Prepare Book 1

- **Who:** Admin presses the button. The worker on Savar's Mac does the work.
- **Where:** The child's admin page `/admin/children/<child id>`, button "Prepare next workbook". The Production page `/admin/workbooks` and Home show the same control as "Prepare workbook" for a child with no book. The run page is `/admin/workbooks/runs/<run id>`.
- **What the system does:**
  1. A confirm box opens. After "OK", `POST /api/admin/children/<id>/workbook-runs` calls `startWorkbookRun`. It makes one run per child (`public.workbook_runs`).
  2. With `WORKBOOK_RUNNER=mac` (the default), `routeWorkbookRun(..., "mac")` queues the run for the worker. The page opens the run page.
  3. The worker (`scripts/workbook-worker.ts`, loop `src/lib/workbook-worker.ts`) writes its heartbeat to `public.workbook_workers`, takes the oldest queued run, and renews its lease every 30 seconds. It keeps the Mac awake with `caffeinate`.
  4. The job (`src/lib/workbook-job.ts`) plans the book, asks the AI to write each day page (`claude -p`, the Claude subscription first, the API after a usage limit), checks every question by code and by the solve check, checks each page fits, and prints with Chrome. It stores the draft and its PDF.
  5. If first pages exist for this child's finished test and the new plan makes the same pages, the run reuses them (`docs/first-pages.md`, flow step 9). If it does not, the run stops before any AI call and the admin chooses "Use the sample's plan" or "Make it without the sample pages" on the child page.
  - Tables written: `workbook_runs`, `workbook_run_pages`, `workbook_run_calls`, `workbook_run_solves`, `workbook_run_ai_calls`, `workbook_drafts`, `workbook_draft_revisions`, `workbook_audit`.
- **Check it worked:**
  - The run page shows "Workbook computer online", a progress bar, and at the end the state "done" with check chips for every page and question. Open it only for the check, then close it (AGENTS.md: do not leave a refreshing admin run page open).
  - Read-only SQL: `select id, status, step, runner, done_pages, total_pages, error, heartbeat_at from public.workbook_runs where child_id = '<child id>' order by created_at desc limit 3;`
- **Common failures and fixes:**
  - Refusal text "This family's plan is cancelled, so no new workbook can be prepared.", "...is paused...", or "A pause, cancellation or restart for this family is still in progress...": a plan control blocks preparation. Stop and ask Savar (`src/lib/workbook-plan-refusal.ts`, `docs/plan-controls.md`).
  - Answer `busy`: a run already works. Open the run page it names.
  - "Waiting for the workbook computer. It is offline, last seen ...": the Mac is asleep, off or offline. Wake it. Check the log. The run starts when the worker returns. A run with no progress for 6 minutes is taken up again where it stopped. "Run on the server with the API" costs API money: ask Savar.
  - "The site's code changed": the run started on other code. Press "Prepare next workbook" again. To stop a bad run, press "Stop this run", then "Yes, stop it".
  - A question or page failed its check: the chips name them. Use the comment reviewer on the run page ("Send all comments") or prepare again.
- **Sources:** `src/app/api/admin/children/[id]/workbook-runs/route.ts`, `src/components/prepare-workbook.tsx`, `src/lib/workbook-job.ts`, `src/lib/workbook-worker.ts`, `docs/workbook-worker.md`, `docs/first-pages.md`, `docs/workbook-rendering.md`.

## Step 5. Review the draft and approve for print

- **Who:** Admin. Savar says go first (see "Stop and ask Savar").
- **Where:** The run page `/admin/workbooks/runs/<run id>`. Button "Approve version N for print".
- **What the system does:**
  1. A confirm box asks "Approve this version of ...'s workbook for print?".
  2. `POST /api/admin/workbooks/runs/<id>/approve` calls `approveCheckingNewMarks`, then `approveDraft` (`src/lib/workbook-ship.ts`). The server refuses when any check fails (`approvalProblems`): the run is not done, a question failed its check, a page failed fit, a page is not in the PDF, or a question has no measured place.
  3. On success the draft becomes a stored workbook, status `approved`, and the page opens `/admin/workbooks/<workbook id>`.
  4. The approval freezes the print contract (`src/lib/workbook-print-contract.ts`): `workbooks.printed_revision`, `pdf_sha256`, `print_manifest`, each page's `print_contract`, each question's `regions` and `teaching`. A photo of a printed page is read only against this contract.
  5. After the answer, the site saves the Book 1 baseline once (`captureBook1AfterApproval`, `src/lib/workbook-book1-capture.ts`). The approval never waits for it.
  - Tables written: `workbooks`, `workbook_pages`, `workbook_questions`, `workbook_audit` (`workbook-approved`), `workbook_book1_baselines` or `workbook_book1_baseline_pending`.
- **Check it worked:**
  - The workbook page shows "Approved: <time> by <admin>".
  - Read-only SQL: `select id, number, status, approved_at, printed_revision is not null as has_revision, pdf_sha256 is not null as has_hash, print_manifest is not null as has_manifest from public.workbooks where child_id = '<child id>' order by number;`
  - `has_revision` must be true. A book with no revision is never marked automatically (`docs/workbook-rendering.md`, "Legacy books"). If it is false, stop. Prepare a new draft. Do not render the stored book again to invent a contract.
  - Baseline: `select draft_revision, planning_kind from public.workbook_book1_baselines where child_id = '<child id>';` and `select reason from public.workbook_book1_baseline_pending where child_id = '<child id>';`. The run page and `/admin/next-steps` ("Book 1 starting records") also show "Not saved".
- **Common failures and fixes:**
  - "Not approved:" with a list of reasons: fix each reason, then approve again.
  - "Version N is not the current version": reload the page.
  - "Update first?" (new marks since the plan): this applies to next-book drafts. Press "Update with new marks". "Approve anyway" is noted in the audit. Ask Savar.
  - Baseline pending with reason `planning-capture-missing`, `curriculum-version-changed` or `planned-on-another-build`: recover it on the Mac, before any page is marked: `npm run workbooks:book1-recover -- --run <run id>` (it saves nothing), then add `--save` if the verdict says so (`docs/workbook-worker.md`, "Book 1 baseline recovery"). After the first mark the save refuses (`activity-before-boundary`).
  - Pending reason `revision-changed`: approve the newest version again.
- **Sources:** `src/app/api/admin/workbooks/runs/[id]/approve/route.ts`, `src/components/workbook-ship-actions.tsx`, `src/lib/workbook-ship.ts`, `src/lib/workbook-print-contract.ts`, `src/lib/workbook-book1-capture.ts`, `src/lib/admin-book1-baselines.ts`, `docs/workbook-worker.md`, `docs/workbook-rendering.md`.

## Step 6. Print, check the paper copy, mark printed

- **Who:** Admin.
- **Where:** `/admin/workbooks/<workbook id>`, section "Print and ship", step 2 "Print".
- **What the system does:**
  - "Download PDF for print" opens `/api/admin/workbooks/<id>/pdf?download=1`. It redirects to a short-lived signed link in the private bucket `workbook-pages` (`src/app/api/admin/workbooks/[id]/pdf/route.ts`).
  - "Mark printed" asks "After this, the workbook cannot change." Then `POST /api/admin/workbooks/<id>/status` with `{to: "printed"}` calls `markWorkbook`. The database locks the workbook and its draft: no edit, no new revision (`isLocked`, `supabase/migrations/20261101_workbook_ship.sql`).
  - Tables written: `workbooks.printed_at`, `workbooks.status`, `workbook_audit` (`workbook-printed`).
- **Do this before you press "Mark printed".** The mark locks the book. Print one copy. Check it against the PDF and the answer key: the child's name, page order, every question, legibility, no clipping, writing space, and a page code and QR code on every page (#935 lists the same checks). Keep any defect note private if it holds child data.
- **Check it worked:**
  - The page shows "Printed: <time> by <admin>. A printed workbook cannot change."
  - Read-only SQL: `select number, status, printed_at from public.workbooks where id = '<workbook id>';`
- **Common failures and fixes:**
  - "the workbook is draft, not approved": approve first (step 5).
  - "This family's plan is paused. This workbook cannot be marked printed.": a plan control blocks it. Ask Savar.
  - A defect on the paper copy: do not press "Mark printed". Return to the draft, fix it, and approve a new version.
- **Sources:** `src/components/admin-workbook.tsx`, `src/components/workbook-ship-actions.tsx`, `src/app/api/admin/workbooks/[id]/status/route.ts`, `src/lib/workbook-ship.ts`, `src/lib/workbook-plan-refusal.ts`.

## Step 7. Send the "Workbook ready" email

- **Who:** Admin. This is a real-parent email: Savar says go.
- **Where:** `/admin/workbooks/<workbook id>`, the email panel below "Print and ship". The same controls are on `/admin/next-steps` under the card's "Workbook emails". The button "Workbook ready" works only while the status is `printed`.
- **What the system does:** Press "Workbook ready". Read the recipient and text in the preview. Press "Send workbook ready email". `POST /api/admin/cards/<id>/workbook-email` with `{kind: "ready", workbookNumber}` calls `sendWorkbookNotice` (`src/lib/workbook-email-server.ts`). One key per saved card and workbook number. The email says the workbook is ready and will ship soon. It changes no status and no billing.
- **Check it worked:** The email history shows "Workbook ready: sent". Read-only SQL: `select kind, workbook_number, status, sent_at from public.workbook_emails where card_setup_id = '<card id>' and kind = 'ready';`
- **Common failure and fix:**
  - Error `card_not_saved`: the child has no confirmed saved card (step 1).
  - Error `welcome_sending`: the welcome is still sending. Wait up to 10 minutes.
  - Status `unknown`: **do not resend.** Check Resend. Ask Savar.
  - The button is off because dispatch was already claimed: ready cannot go after dispatch for the same workbook.
- **Sources:** `src/components/workbook-emails.tsx`, `src/app/api/admin/cards/[id]/workbook-email/route.ts`, `src/app/(product)/admin/workbooks/[id]/page.tsx`, `docs/workbook-delivery-emails.md`.

## Step 8. Mail or hand over the workbook

- **Who:** Team.
- **Where:** Outside the site.
- **What the system does:** Nothing. Use a tracked service, or hand it over. Write down the carrier and the tracking number. Check the shipping address from step 3 again before you seal the package.
- **Check it worked:** You have a tracking number, or a note of the hand-over time and place.
- **Common failure and fix:** No address, or the address is a billing address only. Stop and ask the parent.

## Step 9. Send the delivery email and mark shipped

- **Who:** Admin. The delivery email is a real-parent email: Savar says go.
- **Where:** `/admin/workbooks/<workbook id>`: the email panel, then "Print and ship", step 3 "Ship".
- **What the system does:**
  - Delivery email: press "Hand delivery" (no tracking fields) or "Courier" (carrier and tracking number are required; an HTTPS tracking link is optional). Press "Preview courier email" for a courier. Check the text. Press "Send delivery email". Hand delivery and Courier share one dispatch key, so the second method cannot send a copy. The email says the workbook is on its way. It does not claim arrival.
  - "Mark shipped" asks for a confirm, then `POST /api/admin/workbooks/<id>/status` with `{to: "shipped"}`. The workbook goes from `printed` to `shipped`. Table written: `workbooks.shipped_at`, `workbook_audit` (`workbook-shipped`). The answer carries `firstShipped` for the child's first shipped workbook. No plan starts here.
  - The two actions are independent. Do both on the day you mail.
- **Check it worked:**
  - The email history shows the delivery email as sent. The page shows "Shipped: <time> by <admin>".
  - Read-only SQL: `select kind, workbook_number, status, delivery from public.workbook_emails where card_setup_id = '<card id>' and kind = 'dispatch';` (the `delivery` column holds the method and tracking) and `select number, status, shipped_at from public.workbooks where id = '<workbook id>';`
- **Common failure and fix:**
  - "the workbook is approved, not printed": mark it printed first (step 6).
  - "This family's plan is ... This workbook cannot be marked shipped.": a pause or cancel blocks it. Ask Savar.
  - Courier without a carrier or tracking number: the form refuses. Fill both.
- **Sources:** `src/components/workbook-emails.tsx`, `src/lib/workbook-email.ts`, `src/app/api/admin/workbooks/[id]/status/route.ts`, `docs/workbook-delivery-emails.md`.

## Step 10. Confirm delivery

- **Who:** Admin, after the workbook reaches the family's home.
- **Where:** `/admin/workbooks/<workbook id>`, "Print and ship", step 4 "Workbook delivery". It shows only while the status is `shipped`.
- **What the system does:**
  1. Enter the date and time of arrival in the family's time zone. The form shows the zone in plain words. Press "Confirm workbook delivered".
  2. `POST /api/admin/workbooks/<id>/delivery` calls `confirmDelivery` (`src/lib/workbook-delivery.ts`). The database checks admin membership, the workbook and its shipment, the time, uniqueness and the family fence in one transaction.
  3. After the answer, `refreshWorkbookScanClock` runs (`src/lib/workbook-scan-recovery-server.ts`). The delivery time starts the scan reminder clock.
  - Tables written: `workbook_delivery_receipts`, `workbook_audit`. A confirmation makes no billing request and sends no email.
  - A confirmed receipt opens the parent's answer key link and the child's desk pages. Before it, the desk shows "Your workbook pages will open here after we confirm delivery." (`src/app/(product)/tutor/page.tsx`).
- **Check it worked:**
  - Reload shows the saved time and who recorded it.
  - Read-only SQL: `select number, delivered_at, time_zone, recorded_at, audit_id from public.workbook_delivery_receipts where workbook_id = '<workbook id>';`
- **Common failure and fix:**
  - `invalid_time`: the time is not valid, is before shipment, or is in the future. Enter the real time.
  - `zone_changed`: the family's zone changed. Reload and enter it again.
  - A repeat with a different time is refused. To fix a wrong time, press "Correct delivery time", enter the correct time and a reason. A correction adds an audit entry. It does not recall any email.
  - Do not confirm without evidence of arrival. The receipt is the anchor for the start of the plan and for scan reminders.
- **Sources:** `docs/workbook-delivery.md`, `src/components/workbook-delivery.tsx`, `src/app/api/admin/workbooks/[id]/delivery/route.ts`, `src/lib/workbook-delivery.ts`, `src/lib/workbook-delivery-store.ts`, `docs/parent-dashboard.md` ("Workbooks and answer keys").

## Step 11. Start the plan

- **Who:** Admin. **Savar says go first.** This step moves money.
- **Where:** `/admin/next-steps`, "Needs you", group "Free months to start" (it lists a child whose Book 1 has a delivery receipt and has no plan). The card shows the button "Workbook delivered: start plan". Without a delivery receipt the button is hidden and the card shows "Open this child's workbook 1 and confirm its delivery. Then return here to start the plan." with a link.
- **What the system does:**
  1. A confirm box asks "Has <child>'s first workbook arrived at their home? Confirm only after delivery." The box adds the family-window sentences when the family may already have a free window.
  2. `POST /api/admin/cards/<id>/start` with `{deliveryConfirmed: true}` checks the admin, the origin, the saved card, and the delivery receipt (`firstDelivery`). It takes a plan-start hold, then calls `startPlan` (`src/lib/stripe.ts`).
  3. `startPlan` creates a Stripe subscription: CAD 79.99 a month for the first child (CAD 59.99 for each later child), with a 30-day free trial. No charge now. Stripe charges on day 30 and every month after. A sibling who starts inside the family's one 30-day window has the same trial end. A sibling who starts after it pays at once (`docs/plan-controls.md`, "Family admission"). The create call has one Stripe key, so a second press cannot make a second plan.
  4. `applyPlanStart` writes `public.child_plan_states` (kind `free_month`) at once, before any webhook. This opens the product for that child: Scan pages, Explain, Maya chat and the dashboard follow the plan gate (`src/lib/plan-access.ts`).
  5. `sendPlanStartEmail` sends one confirmation email per plan generation with the price, the first charge date and how to cancel.
  6. The webhook `/api/stripe-webhook` keeps the row up to date after that. Each day the sweep in `/api/reminders` reads the row again.
  - Tables written: `plan_starts` (the start and its email state), `child_plan_states`.
  - The answer is `{ok, firstChargeAt, access, confirmation}`. The card then shows "Started. CAD 79.99 a month. First charge <date>".
- **Check it worked:**
  - The card shows "Started" and the first charge date, which is 30 days after the start.
  - In Stripe (live mode): the Customer has one subscription in `trialing` status with a trial end 30 days out. It has no paid invoice.
  - Read-only SQL: `select generation, state, monthly_cents, trial_end, first_charge_at, email_state from public.plan_starts where card_setup_id = '<card id>' order by generation desc limit 1;` and `select kind, next_charge_at, monthly_cents, read_at from public.child_plan_states where child_id = '<child id>';`. Expect `state = 'started'` and `kind = 'free_month'`.
  - The confirmation email appears in `/admin/emails`.
- **Common failures and fixes** (the page text comes from `src/components/start-plan.tsx`):

| Answer | Meaning | Do this |
|---|---|---|
| `delivery_receipt_required` | No delivery receipt for Book 1. | Do step 10. |
| `no_card` | No saved card. | Check step 1. |
| `already` | The child already has a plan in Stripe. | Open it in Stripe. Do not start another. |
| `restart_required` | The child's plan ended. | The parent restarts in the Account tab. Ask Savar. |
| `unconfirmed` | Stripe did not confirm the start. | **Do not press again.** Reload in 15 minutes. Check the family in Stripe. |
| `needs_team` | No plan found after 24 hours. | Open the family in Stripe. If no plan came from this start, press "I checked Stripe: close this start". If you find a plan, leave it. Ask Savar. |
| `payment_refused` | Stripe refused the saved card. | Ask the parent to update the card in the Account tab. |
| `family_unavailable` | The family is being deleted. | Stop. Ask Savar. |
| `failed` or "response was lost" | The route could not confirm. | Check the plan in Stripe before any retry. |
| `access: pending` | The plan started in Stripe, but the plan state write did not answer. | Do not start again. The webhook and the daily re-read open it. Check `child_plan_states` later the same day. |
| `confirmation` not `sent` | The start email was not confirmed. | The job tries again every 15 minutes. Check "Workbook emails". If it still did not go, ask Savar. |

- **Sources:** `src/app/api/admin/cards/[id]/start/route.ts`, `src/components/start-plan.tsx`, `src/components/admin-records.tsx` (`StartGate`), `src/lib/plan-start-errors.ts`, `src/lib/stripe.ts` (`startPlan`), `src/lib/plan-state.ts`, `src/lib/plan-access.ts`, `src/lib/subscription-plan.ts`, `docs/stripe-webhook.md`, `docs/plan-controls.md`, `docs/workbook-delivery-emails.md`.

## Step 12. Check what the parent sees

- **Who:** Admin, with the parent on a call if the parent agrees.
- **Where:** The parent's account. The admin reads `/admin/parents/<parent id>` and `/admin/scans`.
- **What the system does:** The plan gate is open for this child.
  - Parent home opens the desk with a form POST to `/api/desk/open`. The desk `/tutor` shows the shipped workbook's pages (the child's desk, `src/lib/desk.ts`).
  - The Workbooks tab shows the book and, after the delivery receipt, the answer key.
  - Scan pages open for this child with no switch. Marking follows `SCAN_MARKING_ENABLED` only (`docs/scan-pages.md`). With `test-only`, a real family's pages upload but are not marked automatically. Do not change it.
  - The scan reminder emails stay behind `WORKBOOK_SCAN_REMINDERS_ENABLED` and `WORKBOOK_SCAN_TEST_PARENT_IDS`.
- **Check it worked:** Ask the parent to open the desk and the Workbooks tab. Check `/admin/scans` for new photos. Check the child's page for the plan state.
- **Common failure and fix:**
  - The desk says "Your workbook pages will open here after we confirm delivery.": the receipt is missing (step 10).
  - The parent sees no dashboard or no scan link: read `child_plan_states` for the child. If `kind` is not `free_month`, see step 11, `access: pending`.
  - The parent scans a page and gets no result: expected while marking is `test-only`. Do not change the switch. Tell Savar.
- **Sources:** `docs/parent-dashboard.md`, `docs/scan-pages.md`, `src/lib/desk.ts`, `src/lib/plan-access.ts`, `src/app/(product)/tutor/page.tsx`.

## Step 13. Day 30: the first charge

- **Who:** System. The admin watches.
- **What the system does:**
  - Stripe emails the parent a reminder 7 days before day 30 and a receipt after the charge (Stripe Billing settings, `docs/workbook-delivery-emails.md`).
  - On day 30, Stripe charges CAD 79.99. The webhook (`invoice.paid`, `customer.subscription.updated`) moves `child_plan_states` to `paying`. If the payment fails, the plan state becomes `payment_failed` and the product closes for that child (`docs/stripe-webhook.md`).
  - Workbook 2 and later deliveries never restart the plan (`docs/workbook-delivery.md`).
- **Check it worked:** In Stripe, one paid invoice. Read-only SQL: `select kind, read_at from public.child_plan_states where child_id = '<child id>';`. Expect `paying`.
- **Common failure and fix:** `payment_failed`: the parent updates the card in the Account tab. Do not edit Stripe by hand. Ask Savar.
- **Sources:** `docs/stripe-webhook.md`, `docs/plan-controls.md`, `docs/workbook-delivery.md`.

## Mismatches found

Where a doc and the code differ, this runbook follows the code.

1. **Button name in code comments.** `src/lib/workbook-ship.ts:14`, `src/app/api/admin/workbooks/[id]/status/route.ts:8` and `src/components/admin-workbook.tsx:171` say "Workbook shipped: start plan". The real button text is "Workbook delivered: start plan" (`adminAction`, `src/lib/family-plan-words.ts:6`). Fix the comments.
2. **Start button and the delivery receipt.** `docs/workbook-delivery-emails.md` (step 5) says to use the start button "after the first workbook arrives" and "confirm delivery". It does not say the start needs a saved delivery receipt. The code requires one: the start route answers `delivery_receipt_required`, and the card shows the button only when `firstWorkbook.delivered` is true (`src/app/api/admin/cards/[id]/start/route.ts`, `src/components/admin-records.tsx`). `docs/workbook-delivery.md` has it right.
3. **What "Mark shipped" gives the family.** The confirm text says "The family can then read it in their account." (`src/components/workbook-ship-actions.tsx`, `MARK.shipped`). The desk and the answer key open only after the delivery receipt (`docs/parent-dashboard.md` "Workbooks and answer keys"; `src/app/(product)/tutor/page.tsx` shows "Your workbook pages will open here after we confirm delivery."). Follow the desk rule. Fix the confirm text.
4. **Stale sibling sentence.** `siblingStop` in `src/lib/family-plan-words.ts:5` says a sibling's price "can start once the sibling update ships". `docs/plan-controls.md` says family pricing (D-306) is live. The text shows only for the error `family_plan_upgrade_required`. Ask Savar if that error can still occur.
5. **Times in two zones.** The admin workbook page says "Times are Pacific" (`src/components/admin-workbook.tsx`). The delivery form uses the family's time zone (`docs/workbook-delivery.md`). Both are correct. Write the zone with each time in the run log.
6. **Email controls and status.** `docs/workbook-delivery-emails.md` says the controls appear "after the workbook is marked printed". The code shows them for `printed` and `shipped`, and a note for an approved book. "Workbook ready" works only while `printed` (`src/app/(product)/admin/workbooks/[id]/page.tsx`). No conflict in use, but note it.

### Not verified in this runbook

These need live access. The team checks them in the run log: the live values of every Vercel flag, that Stripe is in live mode, that the webhook answers 204, the state of the Resend domain, that the pg_cron jobs `workbook-welcome-emails` and `assessment-reminders` run, and that the Mac worker runs the latest `origin/main`.

## Run log

Fill one row for each step during the first real run. Write times with the zone. Do not write child names or addresses here. Use ids.

| Date | Step | Who | Started | Finished | Time taken | What went wrong (or "nothing") | Fix or follow-up |
|---|---|---|---|---|---|---|---|
| | Before you start | | | | | | |
| | 1. Card saved | | | | | | |
| | 2. Welcome email | | | | | | |
| | 3. Address | | | | | | |
| | 4. Prepare Book 1 | | | | | | |
| | 5. Approve | | | | | | |
| | 6. Print, mark printed | | | | | | |
| | 7. Ready email | | | | | | |
| | 8. Mail | | | | | | |
| | 9. Delivery email, mark shipped | | | | | | |
| | 10. Confirm delivery | | | | | | |
| | 11. Start plan | | | | | | |
| | 12. Parent view | | | | | | |
| | 13. Day 30 | | | | | | |
