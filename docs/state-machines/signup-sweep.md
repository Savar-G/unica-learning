# Inventory: signup, auth, small machines, and repo-wide sweep

Repo: /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/site-state-machines (branch site/state-machines, read only).
Method: rg, sed, cat, and three small python scans (kept in the scratchpad folder `sweep/`) for the SQL check constraints, the TS unions and the status-literal counts. Nothing in the repo was changed, no test or build was run. Anything not read in full is marked "(unverified)".

## Top findings

1. LATENT ADMIN CRASH (static reading, unverified at runtime). `email_log.kind` now allows `scan_inactivity` (supabase/migrations/20261107073840_workbook_scan_reminder_episodes.sql:72, and the claim function inserts it at :385). The admin side does not know that value: `EmailKind` (src/lib/admin-dashboard.ts:113), the inline `RawEmail.kind` (admin-dashboard.ts:23) and `EmailRow.kind` (src/lib/admin-store.ts:897) all stop at `monthly_summary_unsubscribe`. `dashboardRows` reads every `email_log` row with no kind filter (admin-store.ts:1014), and `buildFamilies` calls `subjectFor(e.kind, ...)` on each (admin-dashboard.ts:291), which does `EMAIL_KINDS.find(...)!.info.subject` (admin-dashboard.ts:252). A `scan_inactivity` row gives `undefined.subject` -> TypeError inside `buildFamilies`, so every admin screen built from `dashboardRows` fails (the dashboard, and the family view that uses `Family.emails`); screens that only print `EMAIL_LABEL[e.kind]` (src/components/admin-family.tsx:66, admin-dashboard.tsx:96,133, admin-dashboard.ts:381,547) would print `undefined`. No admin test names `scan_inactivity` (rg over src/**/*.test.* finds it only in two workbook-scan tests: workbook-scan-reminder-store.test.ts and workbook-scan-maintenance-server.test.ts). Sending is gated by `WORKBOOK_SCAN_REMINDERS_ENABLED` test-only (docs/workbook-scan-progress.md:16-17), so the first send to a test parent arms it.
2. `/admin/next-steps` "Plan start" column is stateless. It shows the "Workbook delivered: start plan" button for every card row with `card_saved_at && stripe_customer_id` (src/components/admin-records.tsx:38). The page never reads `child_plan_states` (rg finds no `child_plan_states` in src/lib/admin-store.ts or admin-records.tsx), so a family whose plan already runs sees the button again after any reload. The server refuses with `already` (src/components/start-plan.tsx:8), so no double start, but the screen lies about what is left to do. Only the in-tab `done` state says "Started".
3. `feedback.status` (`new | read | closed`) has no writer. Only `submit_feedback` inserts (default `new`, migration 20261106_parent_feedback.sql:12, :19-20 grants select only). The admin table prints the raw value in a "Status" column (src/components/admin-feedback.tsx) and it will always say `new`. "Team status" is a dead state machine: 3 states, 1 reachable.
4. `sendSignInLink` rate limit is count-then-insert with no lock (src/lib/account-server.ts:85-96, `MAX_LINKS_PER_HOUR = 5` at src/lib/sign-in-link.ts:9). Parallel POSTs to /api/account/sign-in-link can all read a count under 5 and all insert and all send. The same path has no route test: rg finds no test file for sendSignInLink, /api/account/sign-in-link or /api/account/sign-in-link/use (only the pure `linkState`/`canResend`/`safeNext` in src/lib/sign-in-link.test.ts).
5. A finished test with no report row has no exit screen. `testFact` returns `running` for a completed test without a report (src/lib/parent-view.ts:156-162) -> stage `test_running` (src/lib/child-stage.ts:44-52) -> tabs are only `assessment`, `account` (child-stage.ts:65-66). `readOverview`, the only place with the `resultLate` flag (parent-view.ts "RESULT_LATE_MS"), returns null without an `overview` tab. So the parent reads "finished the test ... By email, within minutes" (src/lib/parent-assessment.ts `testWords` case "wait") for as long as the report job fails. (Whether the job retries is the assessments agent's area; unverified here.)
6. The sign-in link is burned before the sign-in works. `/api/account/sign-in-link/use` sets `used_at` first (src/app/api/account/sign-in-link/use/route.ts:23-24), then calls `generateLink` and `verifyOtp` (:32-34). Any Auth failure leaves a used link. The page shows "failed" only from a `?error=1` query flag (src/app/(product)/sign-in/link/page.tsx:26), not from stored state. Recovery works (resend), but "failed" is not a stored state, so a second device that opens the link later reads "already used".
7. (Fixed in item 12, #815: the route takes a finish claim before the first password change.) Two tabs finishing the same signup race on the password. `/api/account/finish` replaces the password with an unknown one and then sets the parent's own one (src/app/api/account/finish/route.ts:72, :86) before it takes the `create_family` advisory lock (:99; supabase/migrations/20261012_add_family_admission.sql:25). The tab that loses the lock gets `{ok:true, existing:true}` ("nothing changed" message, src/app/(product)/account/(dashboard)/page.tsx, the `existing === "1"` alert) but its password write already replaced the winner's. Low severity: the comment at finish/route.ts "Auth and create_family still do not share a transaction (#121)" names the gap.
8. Duplicated enums with no generation. 107 enum-like SQL check rows (Part 2a) are mirrored by hand-written TS unions. Real drift today: `email_log.kind` has 4 copies (SQL, `LogKind` reminders.ts:21, `EmailKind` admin-dashboard.ts:113, inline in admin-dashboard.ts:23 and admin-store.ts:897) and 2 of them miss `scan_inactivity` (finding 1). `in_progress | completed | expired` is declared 3 times (src/lib/test-api.ts:10, src/lib/assessment/attempt.ts:12, src/lib/assessment/anonymous-copy.ts:149). `server | mac` twice (src/lib/workbook-job.ts:126, src/lib/workbook-ai.ts:29). The plan gate reasons twice (src/lib/plan-access.ts:20, src/lib/scan-marking-access.ts:22 plus a runtime array at :23). 5 tables repeat the same 6 province values in a check. 56 distinct RPC `'status'` strings (449 occurrences, counting superseded function versions) are returned by SQL functions across 48 migrations (Part 2d).

Cross-area signals worth knowing (not deep-dived, other agents own them): `parents.deletion_requested_at` fence and `family_deletions` (billing/deletion); `child_plan_states.kind` (billing); `StartState` in src/lib/assessment/attempt.ts:62 (assessments); `maya_chat_families` and `chatFamilyGate` (desk/Maya).

---

# Part 1: machines

### 1. Signup form with email code (client machine on /start)
- Entity / storage: in-memory React state in `AccountSignup` (src/components/account.tsx:176-300). No database row until /api/account/finish. Supabase Auth holds the user (unconfirmed, then confirmed by the code). Tab storage keeps `unica:source`, `unica:visit`, `unica:steps` (visit-source.ts, ad-visit-steps.ts).
- States: `step` = "form" | "code" (account.tsx:190); `proved` = email string | null (:197, "email this tab has already proved"); `busy` bool; `failure` = AccountError | null (:187); `note` = CodeNote (7 values + null, :133); `sentNow` bool (:195); `resending` bool; `errors` map; `phone` prop (UA based) removes the password field. Effective sub-states: form / code-entry / code-entry-proved-retry (`proved === cleanEmail`, shows "Try again") / honeypot-fake-code (bot filled `website`, step "code" with nothing sent, :278-280).
- Transitions: form -> code on submit after `sendCode` ("sent" or "wait" both advance; "failed" stays, :254-294). code -> proved on `verifyOtp` ok (:297-323). proved -> done on `finish()` ok (:215-251). code -> form on "Change your details" (:371). finish() error `signed_out` -> resets proved/code/note/step to form (:224-231); `weak_password` or `invalid` -> back to form with proof kept (:235-239); every other error stays in the code step with `proved` set. Triggers: the parent's clicks; Supabase Auth answers (429 -> "wait"/"too_many", `otp_expired` or 403 -> "expired"). Rules live in account.tsx only (client), plus the server rules in finish/route.ts.
- Where rules live: one file for the flow (account.tsx, 1108 lines holds 12 components, 3 separate small machines: signup, sign-in modes, link send). `CodeNote` text map is shared with `SignIn` (account.tsx:135-155). The code-error mapping (`error.status === 429 ? "too_many" : otp_expired || 403 ? "expired" : "check_failed"`) is copy-pasted in signup (:316) and sign-in (:542).
- DB enforcement: none for this screen. The server enforces the proof in /api/account/finish (see machine 2), not the client `proved` flag.
- Impossible / unhandled states: AccountError values `unconfirmed`, `send_failed`, `bad_json` have no own case in `errorText` (account.tsx:48-69) and fall to the generic "We could not save your details" (e.g. `unconfirmed` is a real answer from finish/route.ts:59). `proved` is client-only memory: a reload loses it, but the Supabase session stays, so the next submit sends a new code although the tab is already signed in (finish would succeed). Honeypot path shows "We sent a code" text variants but sends nothing (by design).
- Race / duplicate-transition risks: `busy` guards double submit inside one tab (:256, :299). `resend()` has no 60 s throttle in the signup (the sign-in form has `lastSent`, :466, :514-521); Supabase's 429 covers it. `markAdStep` posts once per tab by sessionStorage record (ad-visit-steps.ts:53-65).
- What the user sees: form (account.tsx:380+), code step with alert text (:336-376), "Try again" with the proof kept, error alerts from `errorText`. After success: router.replace("/account?sent=1" | "/account" | "/account?existing=1") (:246-249).
- Existing tests: src/lib/account-finish.test.ts (server side), src/lib/account.test.ts (7 tests, validators), src/components/account.test.ts (1 test, StartTest button only). No test drives AccountSignup's step/proved transitions (unverified: no jsdom component test found by name).
- Pure core already? No. The step/proved/note logic is inline in the component.
- Value x risk: UX value medium (the generic-error gap, lost proof on reload). DX value medium (one 1100-line file, copy-pasted code mapping). AX value medium. Risk low (no money, no live jobs), but every parent passes here.

### 2. Family admission: /api/account/finish + create_family (+ site cap)
- Entity / storage: Supabase Auth user (`email_confirmed_at`, JWT `amr` claims), `public.parents`, `public.children` (first child), `public.family_deletions` (fence).
- States: auth user unconfirmed / confirmed-without-parent-row / parent-row-exists; admission result `created | exists | busy | unavailable | failed` (src/lib/account-server.ts:19); `AccountError` 12 values (src/lib/account.ts:47-60) for the HTTP answer.
- Transitions: (no parent row) -> parent+child written, by POST /api/account/finish after proof (`PROVED = otp, magiclink, recovery, email/signup, invite, oauth`, finish/route.ts:25). Gate order in the route: signed in (:55-56) -> email confirmed (:57) -> parent row read (:63-68, existing returns ok) -> proof check (:70) -> password reset to an unknown value (:72) -> body parse and validation (:76-83) -> parent's own password (:86) -> session still valid (:90-97) -> `create_family` RPC (:99) -> `exists`/`busy`/`unavailable`/`created` mapping (:100-103) -> phone link or welcome email (:105-115). The SQL function `public.create_family` (supabase/migrations/20261012_add_family_admission.sql:9, latest definition; 20261020 and 20261028 only mention it in comments) takes `pg_advisory_xact_lock`, returns `exists` if the parent row is there, `unavailable` if `family_deletions` has the parent, `busy` if 20 parents were created in the last 10 minutes, else inserts parent and child.
- Where rules live: split: proof and password rules in the route (one file, src/app/api/account/finish/route.ts, long comment header), cap, existence and deletion check in SQL, client mapping in account.tsx `errorText`. `isPhone` (UA) is read in both the page (/start) and the route (account-server.ts:50).
- DB enforcement: yes for cap, existence and deletion fence (advisory lock + checks in one transaction, rolls back the half family). No enforcement that a parent row implies a proved email: the route is the only guard (service-key write).
- Impossible / unhandled states: auth user confirmed with no parent row is a normal state (Google first sign-in, a failed finish). The password of such a user may be an unknown random value after a failed finish (finish/route.ts:72), so password sign-in then says "no match" (account.tsx `signInFailureText`) until the user uses a code or the reset link. `busy` is a site-wide 20 per 10 minutes cap: one script that completes 20 email confirmations can block real signups for 10 minutes (not tested; unverified feasibility, Supabase email limits apply).
- Race / duplicate-transition risks: `create_family` is serialized by advisory lock, so two finish calls give one `created` and one `exists`. The password writes before the lock were not serialized (top finding 7); since item 12 (#815) the finish claim serializes them per user. The comment at finish/route.ts:1-26 documents the other races.
- What the user sees: errors via `errorText`; `busy` -> "Many people are signing up right now" (account.tsx:56); `unavailable` -> "email us"; success -> /account.
- Existing tests: src/lib/account-finish.test.ts (24 `it` blocks, see its describe blocks: password replacement, proof, cap busy, deletion fence, parallel finish treated as existing, phone link, welcome email, 15 s Resend timeout).
- Pure core already? Partly: `cleanChild`, `cleanDetails`, `validPassword`, `signInFailure` in src/lib/account.ts are pure. The route sequence is not a pure state machine.
- Value x risk: high security value, already heavily tested. Risk medium (touches auth, password handling). Not a good first target; the one cheap win is the generic-error gap.

### 3. Sign-in and first sign-in (password, code, Google, no parent row)
- Entity / storage: Supabase Auth session cookies; `public.parents` row presence is the "has a family" state.
- States: `SignIn` mode = "password" | "code" | "enter" (src/components/account.tsx:460); `failed: SignInFailure | null` ("no_match" | "too_many" | "unavailable", src/lib/account.ts:113); `note: CodeNote`; server side: signed out / signed in with parent row / signed in without parent row (-> /account/finish, src/app/(product)/account/(dashboard)/page.tsx:64 `if (!parent) redirect("/account/finish")`).
- Transitions: password -> signed in; password -> code (button) -> enter (after `sendSignInCode`, "no_account" is shown as the same screen as "sent") -> signed in by `verifyOtp`; Google -> /auth/callback -> `exchangeCodeForSession` -> `safeNext(next)` (src/app/auth/callback/route.ts); no parent row -> /account/finish -> FinishAccount -> POST /api/account/finish (machine 2). Page guards: /sign-in redirects a signed-in parent to `next` (src/app/(product)/sign-in/page.tsx).
- Where rules live: account.tsx (SignIn, FinishAccount, GoogleButton), src/app/auth/callback/route.ts, src/app/auth/confirm/route.ts, src/lib/sign-in-link.ts `safeNext`, /account page redirect. Scattered across 5 files, but each is small.
- DB enforcement: Supabase Auth only.
- Impossible / unhandled states: `/account/finish` (page) redirects to /account when a parent row exists; /account redirects to /account/finish when none: no loop, but a stale tab can bounce once. The `next` param passes to pages that each check the session themselves (desk guard comment in account/layout.tsx).
- Race / duplicate-transition risks: sign-in code `resend` has a 60 s client throttle (account.tsx:514-521) but it lives in a ref; a second tab can ask again (Supabase 429 stops it).
- What the user sees: alert texts per `SignInFailure` (account.tsx:422-436); the "no_match" text lists three causes because Supabase cannot tell them apart.
- Existing tests: src/lib/account.test.ts (7), src/lib/supabase-auth-signal.test.ts, src/lib/sign-in-link.test.ts (`safeNext`). No test of the SignIn mode machine.
- Pure core already? No (mode machine inline in the component).
- Value x risk: low-medium value. Low risk.

### 4. Password reset
- Entity / storage: Supabase Auth recovery token (template in src/lib/auth-email.ts, `authEmail("recovery")`), `ResetRequest` state (src/components/account.tsx:931) `"idle" | "busy" | "sent" | "wait" | "bad"`.
- States: request form idle/busy/sent/wait/bad; `?expired=1` flag on /sign-in/reset; after the link: a recovery session -> /account/password -> `NewPassword` (account.tsx:978).
- Transitions: submit -> `resetPasswordForEmail` (redirect `/auth/confirm?next=/account/password`) -> "sent" (same text for known and unknown email) or "wait" on 429; link -> /auth/confirm `verifyOtp({type:"recovery"})` -> redirect `safeNext(next)` or /sign-in/reset?expired=1 (src/app/auth/confirm/route.ts). NewPassword -> `updateUser` -> /account?password=1.
- Where rules live: account.tsx (2 components), auth/confirm/route.ts, auth-email.ts (template), `mayActAsParent()` desk check (desk-guard.tsx:27) before the password change.
- DB enforcement: Supabase Auth.
- Impossible / unhandled states: a recovery session for an auth user with no parent row passes /auth/confirm and lands on /account/password (page not read: unverified how it behaves without a parent row); `finish` accepts the `recovery` amr as proof (finish/route.ts:25), so reset links double as signup proof (documented in AccountError "unproved" text).
- Race / duplicate-transition risks: none of note; Supabase rate limits.
- What the user sees: "If an account uses <email>, we sent it a link" (same for unknown emails), expired alert on reuse (account.tsx `ResetRequest`, the `expired` alert).
- Existing tests: no dedicated test found (rg "ResetRequest|NewPassword" in tests: none) (unverified).
- Pure core already? No. Tiny machine; low value.
- Value x risk: low.

### 5. Phone-to-laptop sign-in link (`public.sign_in_links`)
- Entity / storage: table `public.sign_in_links` (migration 20261011_add_sign_in_links.sql): `token_hash` unique, `expires_at`, `used_at` nullable, parent and child FKs (cascade). Only the SHA-256 hash is stored.
- States: derived by `linkState(row, now)` (src/lib/sign-in-link.ts:28-35): `valid` (used_at null and expires_at in the future), `used` (used_at set), `expired`, `unknown` (no row). The page adds a fifth, `failed`, from the query flag `?error=1` (src/app/(product)/sign-in/link/page.tsx:26), which is not stored. Resend window: `canResend` = created within 7 days (sign-in-link.ts:24-26). Hourly cap `MAX_LINKS_PER_HOUR = 5` (:9).
- Transitions: (none) -> valid by `sendSignInLink` (src/lib/account-server.ts:76-115) from three callers: /api/account/finish for a phone signup (finish/route.ts:106), /api/account/sign-in-link signed in with `{childId}`, or signed out with `{token}` of an old link (src/app/api/account/sign-in-link/route.ts:12-35). valid -> used by POST /api/account/sign-in-link/use (one UPDATE with `.is("used_at", null).gt("expires_at", now)`, route.ts:21-25). valid -> expired by time only (no job, computed on read). Rows are never deleted except by cascade.
- Where rules live: sign-in-link.ts (pure state, TTL, tokens, `safeNext`), account-server.ts (create + rate limit + email), the two routes, the page. 5 files. The strings valid/used/expired/unknown are only in sign-in-link.ts and the page (`text` map keyed by LinkState).
- DB enforcement: unique token hash; hash format check; the single-statement UPDATE is the compare-and-set for "use". Since item 12 (migration `sign_in_races`), the hourly cap and the insert run in `issue_sign_in_link` under one lock per parent, and `expires_at` is the database's `now()` plus the TTL the code passes.
- Impossible / unhandled states: `used_at` set but sign-in failed (burned, top finding 6). A link to a child that was deleted cascades away (the page then shows "unknown"). No state records "email send failed after the row was inserted": the row exists and counts toward the cap although no email went (account-server.ts:96-112: insert before send; a failed send returns "failed" but keeps the row).
- Race / duplicate-transition risks: use: guarded (one statement). Create: count-then-insert was unguarded (top finding 4); fixed in item 12 by `issue_sign_in_link`. Mail scanners: opening the page changes nothing; only the POST uses the link (documented in the route header, good).
- What the user sees: /sign-in/link page per state (title and lead text map, page.tsx:45-50), ResendLink button for used/expired/failed within 7 days, else "Sign in". After use: redirect to /account/start/<child>?via=link.
- Existing tests: src/lib/sign-in-link.test.ts (token, `linkState`, `canResend`, `safeNext`, `startPath`). No test for `sendSignInLink`, the two routes, or the page.
- Pure core already? Yes for state (`linkState`); no for the send and use flows.
- Value x risk: low-medium value (one lying `failed` flag). Risk low-medium (auth sign-in path). The routes need tests before any change.

### 6. Child stage and the Parent home vs dashboard switch
- Entity / storage: no stored stage. `ChildStage` is computed per request (src/lib/child-stage.ts:8) from four facts read by `listChildren` (src/lib/parent-view.ts:184): test fact (assessments + reports), `cards` (card_setups.card_saved_at), `deliveries` (workbook delivery receipts), `child_plan_states.kind`. The dashboard switch is `parentDashboardAccess` (src/lib/parent-dashboard-access.ts:21).
- States: `ChildStage` = ended | active | first_book_coming | test_running | report_ready_bc | report_ready_waitlist | no_test (child-stage.ts:8). `OpeningPage` 5 values (:13). `ChildTab` 8 values (:11). Test fact: none | running | report_ready(curriculum) (:16). Dashboard access: `PARENT_DASHBOARD_ENABLED === "on"` OR family in `test_accounts` OR user in `admin_users` OR any child with an open plan (`familyPlanAccess`). Tab switches: `PROGRESS_TAB_ENABLED === "on"`, Maya tab = test family only (parent-view-server.ts:178-188), scan tab = `scanReleased` or the child's open plan.
- Transitions: first match wins: plan "ended" -> ended; delivered -> active; card saved -> first_book_coming; test running -> test_running; no test -> no_test; else report_ready_bc | report_ready_waitlist by `statusFor(curriculum)` (child-stage.ts:44-53). Triggers: data changes only (test finish, report built, card saved, delivery receipt, Stripe plan event). No route changes a stage directly. `/account` redirects a child whose stage opens on the report to the report (account page `openingPath`, src/lib/parent-assessment.ts:15-24).
- Where rules live: ONE pure module (child-stage.ts, 82 lines) for the stage, tabs and opening page. But the surrounding "is the dashboard open" rule is spread over: parent-dashboard-access.ts, plan-access.ts, scan-pages-access.ts (`markedFamily`), parent-view-server.ts `switches()`, and 7 env switches (PARENT_DASHBOARD_ENABLED in 2 src files, SCAN_PAGES_ENABLED in 3, PROGRESS_TAB_ENABLED in 2, MAYA_CHAT_ENABLED in 3, MONTHLY_SUMMARY_EMAIL_ENABLED in 1, WORKBOOK_RUNNER in 5; rg -l evidence).
- DB enforcement: none (pure derivation). Plan state rows are enforced elsewhere (child_plan_states check, billing agent).
- Impossible / unhandled states: `payment_failed` or `paused` plans with a delivery are stage `active` (only `ended` overrides, child-stage.ts:44-45); the action card says `payment_failed` (parent-view.ts:383) but the stage and tabs do not change (looks intentional). A failed plan read is read as no plans, so an ended family reads as `active` (parent-view.ts:174-181, documented). A card saved beats an open new test (first_book_coming before test_running). `parentDashboard()` returns null on ANY load error and the family silently gets the old Parent home (src/lib/parent-dashboard-server.ts:56-58, comment says this is intended): a paying family can flip between two different home pages between requests, with no notice. The "finished test, no report" stuck state is top finding 5.
- Race / duplicate-transition risks: no writes, so none. Staleness: the layout and the page each call `parentDashboard()` (React `cache`, one read per request) so one request is consistent; two requests can differ.
- What the user sees: dashboard shell (ParentShell) with tabs by stage, or old Parent home (account/(dashboard)/page.tsx:82-124; `if (dashboard)` at :82) with `StartTest` buttons by `StartState`, `PlanClosedNote` for a closed family, a phone card. Two entirely different UIs from one URL.
- Existing tests: src/lib/child-stage.test.ts (17), src/lib/parent-view.test.ts, src/lib/parent-view-server.test.ts, src/lib/parent-dashboard-access.test.ts (9), src/lib/parent-dashboard-server.test.ts, src/lib/plan-access.test.ts (24).
- Pure core already? YES (child-stage.ts is the model of what the other machines should look like; `planAccessRule` in plan-access.ts:31 is pure too).
- Value x risk: stage logic is already extracted. Remaining value is in the access predicate (4 copies of "test family or admin or open plan", machine 11). Risk medium (every parent page).

### 7. Admin funnel stage (a second, separate "stage" model)
- Entity / storage: computed in `buildFamilies` (src/lib/admin-dashboard.ts:258+) from parents, tests, card_setups, waitlist_joins and LIVE Stripe subscriptions (status strings active, past_due, trialing, incomplete). Not from `child_plan_states`.
- States: `Stage` = account | started | finished | card_started | card_saved | trial | paying | cancelled | waitlist (admin-dashboard.ts:67-73), ranked by `RANK` (:96); a family's stage is the furthest `reached` one, with waitlist and cancelled winning ties.
- Transitions: none (derived each page load). Admin text per stage in `STAGE_TEXT`, `STAGE_SHORT`, `STAGE_ACTION` (:76-95).
- Where rules live: admin-dashboard.ts (stage, Stripe status sets `PAYING`, `NEVER_STARTED`), flyers.ts (imports `Stage`), admin-store.ts (rows). Parallel to `ChildStage` (machine 6), `child_plan_states.kind`, and `StartState`.
- DB enforcement: none.
- Impossible / unhandled states: the admin "paying" and the parent dashboard "active" can disagree (Stripe live read vs stored plan row). Not verified whether any admin screen compares them.
- Race / risks: reads Stripe on every dashboard load (admin-store.ts `cardSubscriptions`, `confirmCardsInStripe`); a Stripe outage shows `stripeNote` (admin-dashboard.ts:58).
- What the user sees: /admin dashboard funnel and family list.
- Existing tests: src/lib/admin-dashboard.test.ts.
- Pure core already? Yes (`buildFamilies` is pure over rows).
- Value x risk: AX value (four stage models). Low risk to document, medium to merge (admin money views).

### 8. Legacy booking signup (`public.signups`, `/api/signup`) and signup_heard
- Entity / storage: `public.signups` (`status` reserved|waitlist, `booking_state` pending|ready|not_started, `booking_customer_id`, `ref`), `public.booking_family_links`, `public.signup_heard` (channel, detail).
- States: `status` check (schema.sql:6) set by `statusFor(curriculum)` (src/lib/signup.ts:42-ish). `booking_state` check ('pending','ready','not_started'), NULL for pre-migration rows (migration 20261016_fence_booking_operations.sql:11-12).
- Transitions: insert -> `pending` if reserved else `not_started` (trigger `fence_booking_signup`, same migration). `pending` -> `ready` (with a Stripe customer) or `not_started` (no customer) only, via `finish_booking_signup` (`update ... where booking_state = 'pending'`). The trigger refuses every other change (`booking_transition_unavailable`). Writers: /api/signup (src/app/api/signup/route.ts:57, :77, :84) through `begin_booking_signup` and `finish_booking_signup` RPCs.
- Where rules live: SQL triggers (strong), signup.ts, route. The route has NO caller in src: rg "api/signup" finds only comments (src/lib/signup.ts:1,60). The booking form is gone (signup.ts comment "no longer offered"), but the route still accepts posts, creates a Stripe customer (`cardSetupUrl`, src/app/api/signup/route.ts:76) and emails the team (:94).
- DB enforcement: trigger-guarded transitions, unique ref.
- Impossible / unhandled states: `plan 'both'`, `subject 'Reading'` and `'Math + Reading'` are allowed by the checks (schema.sql:10-11) but the route accepts only `Math` / `one` (route.ts:8, :23).
- Race / duplicate-transition risks: guarded by email advisory lock + trigger.
- What the user sees: nothing (no UI). Admin sees none of this on /admin/next-steps (it reads `card_setups`).
- Existing tests: src/lib/signup-route.test.ts (4).
- Pure core already? Partly (`statusFor`).
- Value x risk: low value (orphan route); the lasting hazard is a live Stripe-creating public endpoint nobody calls. Do not touch the triggers.

### 9. Ad visit funnel and flyer scans
- Entity / storage: `public.ad_visits` (one row per `visit_id`, unique), `public.ad_visit_steps` (PK `(visit_id, step)`), `parents.source->>'visit_id'`, `public.flyer_scans`, `public.flyer_batches`. Tab storage: `unica:source`, `unica:visit`, `unica:steps`.
- States: a visit's steps are a SET, not a sequence: `start_open`, `form_start`, `google_start`, `code_sent` (TS `AD_STEPS` src/lib/ad-visit-steps.ts:8, SQL check in migration 20261022_add_ad_visit_steps.sql:16). "Signed up" is not a step: it is `parents.source.visit_id`. Flyer verdict `Verdict.status` 7 values (src/lib/flyers.ts:102).
- Transitions: keepVisit (first tagged page of a tab) -> POST /api/visit -> `after()` insert, 23505 swallowed (src/app/api/visit/route.ts). markAdStep once per tab -> POST /api/visit/step -> insert; 23503 (visit row not there yet) retries once after 2 s (src/app/api/visit/step/route.ts:42-46); 23505 swallowed. Caller sites: visit-tags.tsx:35 (`start_open`), account.tsx:211 (`form_start`), :291 (`code_sent`), :773 (`google_start`). Flyer: GET /f/<code> -> 302 + `after()` insert into flyer_scans.
- Where rules live: ad-visit-steps.ts (pure, with injected store and sender), ad-visits.ts, visit-source.ts, flyers.ts, the three routes. Step names are duplicated in SQL and TS (`database.ts:40` types the column from `AdStep`).
- DB enforcement: check on `step`, PK, FK to ad_visits, RLS (admins read). Rate limits are TS only (RATE_MAX 500 visits, STEP_RATE_MAX 2000 steps per 10 minutes, count-then-insert, advisory).
- Impossible / unhandled states: a step can exist for a visit in any order (no sequence check). The client marks a step sent in sessionStorage BEFORE the fetch resolves (ad-visit-steps.ts:61, send at :66), so a lost post is never retried.
- Race / duplicate-transition risks: step-before-visit race, handled by the retry. Everything is fire-and-forget after the 204 by design (counts can be lost; documented in the route headers).
- What the user sees: nothing; admin sees /admin/flyers (verdict text) and ad numbers.
- Existing tests: ad-visit-steps.test.ts (8), visit-route.test.ts, visit-step-route.test.ts (6), visit-source.test.ts, flyers.test.ts (18), flyer-route.test.ts (5).
- Pure core already? Yes (all four lib files).
- Value x risk: low. Well tested, no money.

### 10. Parent feedback (`public.feedback`)
- Entity / storage: `public.feedback` (migration 20261106_parent_feedback.sql): `status` text default 'new' check ('new','read','closed'), `product` check (5), `source` check (15 section paths), `unique(parent_id, request_id)`, RLS admin read.
- States: only `new` is ever written. Admission result of the write: `saved | duplicate | conflict | rate_limited | family_unavailable | child_unavailable` (SQL `submit_feedback` return strings, TS `FeedbackAdmission` src/lib/feedback.ts:31 plus a runtime array copy in `feedbackAdmission`).
- Transitions: parent POST /api/account/feedback -> `sendFeedback` -> RPC `submit_feedback` (parent row `for update`, then child check, duplicate/conflict by request id, 5 per rolling hour using `clock_timestamp()` after the lock). new -> read -> closed: NO writer anywhere (service_role and authenticated get select only, migration :19-20). rg for any update of the column finds none.
- Where rules live: SQL function (admission, strong), src/lib/feedback.ts (validation, messages), feedback-store.ts, feedback-memory.ts (test twin), admin-feedback.tsx (read, product filter only), `feedbackSource` section list duplicated from the SQL check.
- DB enforcement: strong (checks, unique request id, lock order, family and child fences via triggers `fence_family_write`, `fence_child_delete_write`).
- Impossible / unhandled states: `read` and `closed` cannot be reached by the app. The admin "Status" column shows `new` for every row.
- Race / duplicate-transition risks: guarded (row lock, unique key; tested by supabase/tests/parent_feedback.cjs).
- What the user sees: parent: FEEDBACK_MESSAGES per error (feedback.ts, `FeedbackError` 11 values). Admin: list, product filter, page size 50, raw status text.
- Existing tests: feedback.test.ts (8), feedback-store.test.ts (2), feedback-memory twin, route.test.ts, supabase/tests/parent_feedback.cjs, src/components/admin-feedback.test.ts.
- Pure core already? Yes for admission (store seam + memory twin).
- Value x risk: either wire real read/closed transitions (admin button) or drop the column from the screen. Low risk (additive table, no money).

### 11. Test family and admin membership (`test_accounts`, `admin_users`)
- Entity / storage: `public.test_accounts` (row exists = test family, `marked_by`, `marked_at`), `public.admin_users`, function `admin_team_ids()` (migration 20261012_add_test_accounts.sql). Writer: POST /api/admin/parents/[id]/test -> `setTestAccount` (src/lib/admin-store.ts).
- States: a boolean encoded as row existence. Effective predicates in code: (a) "test family" = row in test_accounts; (b) "marked family" = test_accounts OR admin_users (`markedFamily`, src/lib/scan-pages-access.ts:7-19); (c) "team" in the admin dashboard = test_accounts OR `admin_team_ids()` (admin-store.ts:1099+, `testIds`); (d) Maya rehearsal-family exception (maya-call-note.ts:124, maya-weekly-email.ts:31).
- Transitions: mark / unmark by an admin only (route checks live admin, same origin, JSON). Family deletion removes the row (cascade).
- Where rules live: SCATTERED. 18 non-test files in src mention `test_accounts` and 14 of them query it directly with `from("test_accounts")` (rg -l evidence). Direct readers: admin-store.ts, admin-maya-chat.ts, maya-call-note-server.ts, maya-call-seams.ts, maya-call-server.ts, maya-chat-server.ts, maya-demo-child-store.ts, maya-minutes-server.ts, maya-weekly-email-store.ts, maya-workbook-server.ts, parent-view-server.ts, scan-pages-access.ts, workbook-scan-maintenance-server.ts, workbook-scan-recovery-server.ts. Comment-only mentions: maya-call.ts, maya-call-note.ts, maya-weekly-email.ts, maya-demo-child.ts. 20 migrations name it in SQL (trigger refusals, retention skip, rehearsal guard), 16 test files. Each site chooses its own failure behavior: `markedFamily` returns false on error (scan-pages-access.ts:8-19, try/catch and `!error` checks), `isTestFamily` in maya-call-seams.ts:62 throws on error, parent-view-server.ts:186 uses `!testFamily?.error && ...`.
- DB enforcement: RLS admin only; SQL triggers refuse some writes for test families (maya_calls, notes). No single SQL function "is_test_family".
- Impossible / unhandled states: an admin who is not in test_accounts is "marked" for scan/dashboard gates but "not test" for Maya gates; the admin dashboard excludes admins via `admin_team_ids`. Predicates (a)-(d) are not the same set.
- Race / duplicate-transition risks: none (idempotent insert/delete). A family unmarked mid-call changes behavior on the next read.
- What the user sees: parent: features appear (dashboard, Maya tab, scan tab) for test families before release. Admin: "test" chip and numbers left out.
- Existing tests: 16 test files mention it, e.g. parent-dashboard-access.test.ts, maya-chat tests.
- Pure core already? No. Candidate: one module with `isTestFamily`, `isMarkedFamily`, `isTeam` and a single failure policy.
- Value x risk: AX and DX value high (14 copies of the same read), UX value indirect. Risk medium (gates decide who sees unreleased features and who gets real emails: weekly Maya email and retention skip use it).

### 12. Admin "Plans and delivery" (`/admin/next-steps`, called "Cards and waitlist" until D-313): what it lists and by what state
- Entity / storage: `card_setups` via RPC `admin_card_setups` (one row per child: `plan`, `price`, `stripe_customer_id` nullable, `card_saved_at` nullable, `report_id`), `waitlist_joins` via `admin_waitlist_joins` (one row per child, unique child_id), `workbook_emails`, open `plan_starts`. Page: src/app/(product)/admin/next-steps/page.tsx (17 lines), `listNextSteps` (src/lib/admin-store.ts:876-889), tables in src/components/admin-records.tsx:34-47.
- States (as the page shows them): a card row is one of: not saved (`card_saved_at` null -> "Not saved" chip), saved with customer -> StartPlan button, saved with customer and an OPEN plan start older than `PLAN_KEY_MS` -> PlanStartStuck (admin-store.ts:468-471; the `stuck` map is built at :470 with `PLAN_KEY_MS` from card-reconcile.ts), saved without customer -> "-". Workbook emails column only when saved. Waitlist rows have no state, only a province.
- Transitions: admin presses "Workbook delivered: start plan" -> POST /api/admin/cards/[id]/start (billing agent area); "I checked Stripe: close this start" -> POST /api/admin/cards/[id]/plan-start.
- Where rules live: the display rules are inline in the JSX of CardsTable (admin-records.tsx:38). The start eligibility is in the start route (not read here).
- DB enforcement: card_setups: unique child, plan check ('one','both'), unique customer. Display: none.
- Impossible / unhandled states: the page ignores the plan state, so StartPlan shows for a child with a running, paused, failed or ended plan (top finding 2). `plan === "both"` shows "Math and reading" although no flow can create it (admin-records.tsx:38). A plan start in state `open` younger than the key life shows nothing special (no "start in progress" label), so an admin can press again and get `already`/`unconfirmed`.
- Race / duplicate-transition risks: server-side guarded (billing area). The screen is a snapshot read at render time (`workbookEmailsReadAt`).
- What the user sees: the two long notes at the top of the page describe the whole flow in prose; per-row state is only the chip and the button.
- Existing tests: admin-workbook-emails tests, src/lib/next-step-server.test.ts (the report-side card flow, not this page), card-reconcile tests (billing). No test of CardsTable's per-state output found (unverified).
- Pure core already? No for the display rule.
- Value x risk: UX value medium (the admin is Savar; a "plan already started" label saves a wasted check). Risk low if read-only labels are added; the start route is money and out of scope.

### 13. `parents.time_zone` (set once)
- Entity / storage: nullable text column. Writer: POST /api/account/time-zone: `update ... where id = $id and time_zone is null` (src/app/api/account/time-zone/route.ts:22), called by `SaveTimeZone` on every Parent home load while null (account.tsx:1101).
- States: null (use postal, province, else Pacific via src/lib/family-time.ts) or set. No transition back.
- DB enforcement: compare-and-set in the update. Race: guarded. Tests: family-time*.test.ts. Pure core: yes (family-time.ts). Value low. Listed only because it is a nullable-column-as-state with a correct compare-and-set.

### Machines owned by other agents (listed, not analysed)
- Workbooks: `workbooks.status`, `workbook_runs.status/step/runner`, `workbook_edits`, `workbook_comments`, `workbook_emails`, scan reminder episodes.
- Assessments, reports, email: `assessments.status`, `StartState`, `reports`, `email_log.status`, `email_copies`, `email_events`.
- Scans, marking, profiles: `scan_photos`, `scan_calibrations`, `scan_marking_jobs`, `scan_mark_changes`, `learning_events`, `child_profiles`, `skill_state_history`.
- Billing and deletion: `child_plan_states`, `plan_starts`, `plan_control_operations`, `card_setups`, `family_deletions`, `family_delete_codes`.
- Desk, Maya, boards: `maya_calls`, `maya_call_alerts`, chat families, spend ledger, board tab/session.

---
# Part 2: repo-wide sweep

Scope and method (read this first):
- 2a: python scan of `supabase/schema.sql` and all 230 files in `supabase/migrations/`, in filename order, with `drop constraint` and `drop column` replayed so the LATEST definition wins (script: scratchpad `sweep/checks.py`). It finds `check (... col in ('a','b'))` and `= any(array[...])`. I also checked by hand with rg that no `check (...in ('...'))` line was missed (two jsonb-key checks were added by hand). It does NOT see enums that live only in function bodies (see 2d) or in `drop`-then-`create` done through `execute format(...)` inside DO blocks (the scan skips `$$` bodies).
- 2b: python scan of `src/**/*.ts(x)` (1533 .ts/.tsx files in src; 977 remain after leaving out tests and database.types.ts) for `type X = "a" | "b"` and `const X = [..] as const`. The scan keeps names matching status/state/step/kind/phase/stage/mode/outcome/reason/result/verdict/route/runner/level/severity/action/channel/actor/writer/provider/engine/attempt/delivery/access/gate/lock/claim/admission/decision/fail/error/choice/tab/reach. "Other files naming it" = other non-test files that contain the identifier. "Other files comparing" = other non-test files whose `===`, `!==`, `case`, `.eq(...)`, `.in(...)` literals share at least two values with the union (at least one for a two-value union); generic literals such as ready, sent, failed inflate this number, so read it as an upper bound.
- 2c: literal counts by python over the same files.
- Limits: unions written inline inside an interface field are listed separately (2b-iii, 73 fields with 3 or more values). Unions that are built with `keyof typeof` or `Exclude<>` are not seen.

## 2a. Enum-like SQL check constraints (latest definition wins)

Counts: 107 rows (a column can show twice when one constraint holds two lists). Constraints that were dropped or replaced are not shown; the file named is the migration that holds the live definition. 17 constraint drops were replayed (email_log x10, workbook_emails x3, child_plan_states, maya_calls, maya_spend, workbook_run_ai_calls) and the `answers.round` column drop (20261024_drop_extra_round_data.sql:18) removed answers_round_check by hand.

Observations from the table:
- Same 6-value province list in 5 places: assessments.province, children.province, anonymous_tests.province, waitlist_joins.province, signups.curriculum. TS source: `CURRICULA` in src/lib/signup.ts:29-36.
- `scan_marking_jobs.state` (queued, running, extracted, finished) has no TS union: the strings are raw in TS (e.g. src/lib/scan-send-marking.ts:50 `.in("state", ["running","extracted"])`).
- `feedback.source` (15 values) is duplicated in `feedbackSource` (src/lib/feedback.ts:18-24).
- Dead allowed values: `signups.plan 'both'`, `signups.subject 'Reading'/'Math + Reading'`, `card_setups.plan 'both'` (no flow creates them; admin still prints "Math and reading", src/components/admin-records.tsx:38).
- `email_log.kind` is guarded by 4 constraints that must change together (kind list, plus 3 partition checks on child_id, status, unsubscribe_hash). The last change needed 2 drops and 2 adds (20261107073840_workbook_scan_reminder_episodes.sql:71-77).

## 2a table

| # | table.column | allowed values | defined in (latest) |
|---|---|---|---|
| 1 | ad_visit_steps.step | start_open, form_start, google_start, code_sent | 20261022_add_ad_visit_steps.sql:16 |
| 2 | anonymous_tests.province | BC, AB, SK, MB, ON, other | 20261016_test_copies_without_names.sql:26 |
| 3 | assessments.help | yes, a-little, no | 20261011_add_assessment_help.sql:9 |
| 4 | assessments.province | BC, AB, SK, MB, ON, other | 20261010_add_assessments.sql:18 |
| 5 | assessments.route | up, stay, down | 20261010_add_assessments.sql:20 |
| 6 | assessments.stage3_route | up, down, none | 20261105_add_third_stage.sql:10 |
| 7 | assessments.status | in_progress, completed, expired | 20261010_add_assessments.sql:13 |
| 8 | card_setups.plan | one, both | 20261011_add_report_card_waitlist.sql:20 |
| 9 | child_deleted_folders.bucket | shown-work, workbook-pages, scan-photos | 20261105_child_delete_file_guards.sql:5 |
| 10 | child_plan_states.kind | not_started, free_month, paying, payment_failed, ending, ended, paused | 20261105234500_plan_controls.sql:314 |
| 11 | children.learning_goal | catch_up, keep_up, get_ahead | 20261016_add_learning_questions.sql:8 |
| 12 | children.math_feeling | enjoys, okay, avoids | 20261016_add_learning_questions.sql:7 |
| 13 | children.province | BC, AB, SK, MB, ON, other | 20261010_add_parents_children.sql:20 |
| 14 | children.weekly_time | under_1h, 1_to_2h, 2_to_3h, over_3h | 20261016_add_learning_questions.sql:9 |
| 15 | email_copies.outcome | sent, refused, unknown | 20261015_add_email_copies.sql:18 |
| 16 | email_copies.report_email | parent, alert | 20261015_add_email_copies.sql:16 |
| 17 | email_events.type | delivered, delivery_delayed, bounced, complained, failed, suppressed | 20261015_add_email_events.sql:17 |
| 18 | email_log.kind | continue, come_back, start, start_followup, unsubscribe, maya_daily, maya_weekly, maya_unsubscribe, monthly_summary, monthly_summary_unsubscribe, scan_inactivity | 20261107073840_workbook_scan_reminder_episodes.sql:72 |
| 19 | email_log.status | claimed, sent, failed | 20261011_add_email_log.sql:18 |
| 20 | family_deletions.phase | checking, deleting | 20261011_add_family_deletion.sql:9 |
| 21 | family_deletions.reason | request, retention | 20261011_add_family_deletion.sql:8 |
| 22 | family_payment_operations.kind | session, intent | 20261011_add_family_deletion.sql:23 |
| 23 | feedback.product | workbook, parent_dashboard, marking, maya, other | 20261106_parent_feedback.sql:8 |
| 24 | feedback.source | /account, /account/feedback, /account/settings, /account/workbooks, /account/scan, /account/progress, /account/notes, /account/report, /account/plan, /account/pin, /account/password, /account/learning, /account/start, /account/finish, /account/maya-notice | 20261106_parent_feedback.sql:10 |
| 25 | feedback.status | new, read, closed | 20261106_parent_feedback.sql:12 |
| 26 | learning_events.evidence_kind | call, scan, answer | 20261029_add_learning_events.sql:45 |
| 27 | learning_events.question_source | workbook, assessment | 20261029_add_learning_events.sql:31 |
| 28 | learning_events.result | right, wrong, blank, right_with_help | 20261029_add_learning_events.sql:39 |
| 29 | learning_events.source | call, marking, assessment | 20261029_add_learning_events.sql:30 |
| 30 | maya_call_alerts.level | unsafe_request, safety_concern, safety_immediate | 20261101_add_maya_call_flags.sql:36 |
| 31 | maya_call_alerts.status | sending, sent, refused, unknown | 20261101_add_maya_call_flags.sql:37 |
| 32 | maya_call_connections.kind | agent_joined, agent_left, child_joined, child_left | 20261101_add_maya_call_connections.sql:24 |
| 33 | maya_call_notes.writer | ai, code | 20261101_add_maya_call_notes.sql:27 |
| 34 | maya_call_sweep_cursors.kind | live, unfinished | 20261105_maya_call_sweep_cursors.sql:12 |
| 35 | maya_calls.assistance | independent, hint, worked_example, guided, answer_given | 20261031_add_maya_calls.sql:50 |
| 36 | maya_calls.flag | unsafe_request, safety_concern, safety_immediate | 20261101_add_maya_call_flags.sql:23 |
| 37 | maya_calls.kind | admin_test, chat | 20261102171510_desk_maya_chat.sql:3 |
| 38 | maya_calls.mode | text, voice | 20261031_add_maya_calls.sql:29 |
| 39 | maya_calls.outcome_reason | solved, child_stopped, time_limit, no_response, technical_issue, content_issue, safety | 20261031_add_maya_calls.sql:49 |
| 40 | maya_calls.paper_status | child_confirmed, declined, unknown | 20261031_add_maya_calls.sql:51 |
| 41 | maya_calls.question_source | workbook, assessment | 20261031_add_maya_calls.sql:33 |
| 42 | maya_calls.safety_severity | concern, immediate | 20261031_add_maya_calls.sql:61 |
| 43 | maya_calls.status | live, ended | 20261031_add_maya_calls.sql:42 |
| 44 | maya_calls.understanding | evidence_observed, uncertain | 20261031_add_maya_calls.sql:52 |
| 45 | maya_minute_grants.kind | child, parent_demo | 20261101_add_maya_minutes.sql:30 |
| 46 | maya_spend.charge | child, global | 20261105_add_maya_spend.sql:21 |
| 47 | maya_spend.what | model, review, note, profile, speech_to_text, voice | 20261105_maya_spend_no_monthly_stop.sql:14 |
| 48 | plan_control_operations.kind | pause, cancel | 20261105234500_plan_controls.sql:15 |
| 49 | plan_control_operations.state | open, applied, refused | 20261105234500_plan_controls.sql:17 |
| 50 | plan_starts.email_send_status | sending, sent, failed, unknown | 20261105_plan_start_holds_deletion.sql:22 |
| 51 | plan_starts.email_state | none, pending, sent, unknown | 20261105_plan_starts.sql:33 |
| 52 | plan_starts.purpose | initial, restart | 20261105234500_plan_controls.sql:48 |
| 53 | plan_starts.state | open, started, other, refused, team_ended | 20261105_plan_starts.sql:28 |
| 54 | plan_starts.team_alert_state | sending, sent, unknown | 20261105_plan_starts.sql:35 |
| 55 | scan_calibrations.state | running, ready, refused | 20261105_scan_crops.sql:18 |
| 56 | scan_link_emails.status | claimed, sent, failed | 20261105_scan_link_emails.sql:16 |
| 57 | scan_mark_changes.actor | parent, admin | 20261107211637_scan_mark_changes_team_actor.sql:7 |
| 58 | scan_marking_jobs.blocked_reason | off, budget, price-unverified, attempts, pending | 20261105_scan_marking.sql:31 |
| 59 | scan_marking_jobs.state | queued, running, extracted, finished | 20261105_scan_marking.sql:22 |
| 60 | scan_photos.state | pending, saved | 20261102_scan_page_photos.sql:36 |
| 61 | signup_heard.channel | friend, search, ai, social, other | 20261008_add_signup_heard.sql:9 |
| 62 | signups.booking_state | pending, ready, not_started | 20261016_fence_booking_operations.sql:11 |
| 63 | signups.curriculum | BC, AB, SK, MB, ON, other | 20261007_add_signup_curriculum.sql:5 |
| 64 | signups.plan | one, both | schema.sql:10 |
| 65 | signups.status | reserved, waitlist | schema.sql:6 |
| 66 | signups.subject | Math, Reading, Math + Reading | schema.sql:11 |
| 67 | skill_state_history.evidence_source | test, pages, workbook, none | 20261104_add_skill_state_history.sql:28 |
| 68 | skill_state_history.reason | failed_review, secure_on_test, held_on_review, in_workbook, needs_attention_on_test, above_school_grade, early_sign_on_test, developing_on_test, no_evidence | 20261104_add_skill_state_history.sql:24 |
| 69 | skill_state_history.state | mastered, working_on, needs_review, not_started | 20261104_add_skill_state_history.sql:23 |
| 70 | waitlist_joins.province | BC, AB, SK, MB, ON, other | 20261011_add_report_card_waitlist.sql:34 |
| 71 | work_reviews.confidence | high, low | 20261011_add_work_reviews.sql:24 |
| 72 | work_reviews.kind | slip, misunderstanding, none | 20261011_add_work_reviews.sql:21 |
| 73 | workbook_book1_baselines.planning_kind | prospective-capture, exact-recovery | 20261107161035_workbook_book1_baseline.sql:17 |
| 74 | workbook_comments.route | question, layout | 20261107042155_workbook_comment_routing.sql:2 |
| 75 | workbook_comments.status | pending, sent, done, failed, stale | 20261102_workbook_comments.sql:17 |
| 76 | workbook_draft_revisions.kind | generated, edit, redo-page | 20261031_add_workbook_runs.sql:57 |
| 77 | workbook_edit_calls.kind | write, solve | 20261102_workbook_edit_call_ledger.sql:6 |
| 78 | workbook_edits.action | edit, fix-question, redo-page | 20261102_workbook_edit.sql:10 |
| 79 | workbook_edits.edit_kind | question, layout | 20261107042155_workbook_comment_routing.sql:4 |
| 80 | workbook_edits.runner | mac, server | 20261102_workbook_edit.sql:15 |
| 81 | workbook_edits.status | queued, running, done, failed | 20261102_workbook_edit.sql:16 |
| 82 | workbook_emails.kind | welcome, ready, dispatch, plan_start | 20261106181619_workbook_ready_emails.sql:3 |
| 83 | workbook_emails.status | pending, sending, sent, failed, unknown, skipped | 20261101_add_workbook_emails.sql:16 |
| 84 | workbook_plan_previews.engine | workbook-preview-sources/1;progress/1;history/1;plan-preview/1, workbook-preview-sources/2;progress/1;history/1;plan-preview/1;book1-baseline/1 | 20261107161035_workbook_book1_baseline.sql:240 |
| 85 | workbook_run_ai_calls.kind | write, solve | 20261101_workbook_mac_runner.sql:51 |
| 86 | workbook_run_ai_calls.outcome | started, answered, failed, unavailable | 20261101_workbook_worker_reliability.sql:6 |
| 87 | workbook_run_ai_calls.provider | subscription, api | 20261101_workbook_mac_runner.sql:52 |
| 88 | workbook_run_solves.verdict | agreed, disagreed, failed | 20261101_workbook_run_solves.sql:17 |
| 89 | workbook_runs.runner | server, mac | 20261101_workbook_mac_runner.sql:18 |
| 90 | workbook_runs.status | queued, running, done, failed, stale | 20261031_add_workbook_runs.sql:29 |
| 91 | workbook_runs.step | plan, write, render, save | 20261031_add_workbook_runs.sql:30 |
| 92 | workbook_scan_reminder_attempts.state | reserved, admitted, sent, refused, unknown, released | 20261107073840_workbook_scan_reminder_episodes.sql:62 |
| 93 | workbook_scan_reminder_messages.state | reserved, admitted, sent, refused, unknown, released | 20261107073840_workbook_scan_reminder_episodes.sql:38 |
| 94 | workbook_scan_trigger_claims.reason | day7_scanned, delivery_backstop | 20261106213840_workbook_scan_receipts.sql:95 |
| 95 | workbook_second_tries.help | none, math-help, unknown | 20261107161035_workbook_book1_baseline.sql:53 |
| 96 | workbook_second_tries.result | right, wrong, blank | 20261107161035_workbook_book1_baseline.sql:52 |
| 97 | workbook_workers.primary_ai | subscription, api | 20261101_workbook_mac_runner.sql:93 |
| 98 | workbooks.status | draft, approved, printed, shipped | 20261029_add_workbooks.sql:38 |
| 99 | email_log.kind (partition checks) | email_log_check: kind in (unsubscribe, maya_unsubscribe, maya_daily, maya_weekly, monthly_summary, monthly_summary_unsubscribe, scan_inactivity) = (child_id is null); email_log_check2/check3: kind in (unsubscribe, maya_unsubscribe, monthly_summary_unsubscribe) = (status is null) and = (unsubscribe_hash is null) | 20261107073840_workbook_scan_reminder_episodes.sql:76; 20261105_monthly_summary_email.sql:24,27 |
| 100 | family_payment_operations.outcome (kind-linked) | kind='session' -> expired, complete; kind='intent' -> canceled, succeeded | 20261011_add_family_deletion.sql:27 |
| 101 | workbook_emails.kind x status-shape (workbook_emails_check) | welcome, plan_start have one shape; ready, dispatch another | 20261106181619_workbook_ready_emails.sql:6 |
| 102 | plan_starts.state (plan_starts_started_has_plan) | state in (started, other) is tied to a plan id being present | 20261105_plan_starts.sql:42 |
| 103 | children.learning_styles (text[] <@ array) | pictures, stories, worked, hands_on (1 to 2 items) | 20261012_add_learning_style.sql:9 |
| 104 | children.interests (text[] <@ array) | animals, sports, space, cooking, games, music, art, nature, vehicles, building (1 to 10 items) | 20261012_add_learning_style.sql:12 |
| 105 | scan_marking_items.observation->>'state' (jsonb key) | pending, scored, parent-pending, parent-checked, unscored | 20261105_scan_marking.sql:60 |
| 106 | scan_marking_items.observation->>'result' (jsonb key) | null or right, wrong, blank | 20261105_scan_marking.sql:61 |
| 107 | workbook_book1_baselines doc.planning.kind (inside a function guard, not a column check) | prospective-capture, exact-recovery | 20261107161035_workbook_book1_baseline.sql:126 |

## 2b. TypeScript string unions and `as const` arrays that name states, statuses, steps, kinds (96 listed)
| type / const | file:line | values | other files naming it | other files comparing >=2 of its literals | mirrors SQL check |
|---|---|---|---|---|---|
| MicState | src/components/admin-maya-voice.tsx:17 | idle, asking, working, blocked, none, failed | 0 | 4 | - |
| CallState | src/components/admin-maya-voice.tsx:18 | ready, connecting, waiting, live, ending, ended, failed | 0 | 15 | - |
| State | src/components/learning.tsx:35 | ask, saved, skipped | 2 | 3 | - |
| CardState | src/components/report-next.tsx:25 | choose, later, saved, error, checking, unknown | 3 | 8 | - |
| WaitState | src/components/report-next.tsx:26 | join, joined, error | 0 | 0 | - |
| HistoryState | src/components/scan-history.tsx:10 | loading, ready, failed, unavailable | 1 | 14 | - |
| ExplanationState | src/components/scan-problem-explanation.tsx:6 | idle, loading, busy, ready, retry, cap, stale, unavailable | 1 | 17 | - |
| StartMode | src/components/test.tsx:122 | new, resume, finish, restart | 0 | 5 | - |
| Status | src/components/unsubscribe.tsx:9 | idle, working, done, failed | 13 | 12 | - |
| SendLinkResult | src/lib/account-server.ts:70 | sent, not_found, too_many, failed | 0 | 24 | - |
| AccountError | src/lib/account.ts:47 | bad_json, invalid, weak_password, too_many, signed_out, busy, store_failed, send_failed, password_change_blocked, unconfirmed, unavailable, unproved | 1 | 15 | - |
| ChildNameError | src/lib/account.ts:82 | bad_json, too_large, forbidden, signed_out, invalid, not_found, book_in_progress, too_many_names, unavailable, store_failed | 2 | 9 | - |
| SignInFailure | src/lib/account.ts:113 | no_match, too_many, unavailable | 1 | 1 | - |
| AD_STEPS | src/lib/ad-visit-steps.ts:8 | start_open, form_start, google_start, code_sent | 0 | 0 | ad_visit_steps.step |
| STAGES | src/lib/admin-dashboard.ts:67 | account, started, finished, card_started, card_saved, trial, paying | 2 | 3 | - |
| EmailKind | src/lib/admin-dashboard.ts:113 | start, start_followup, continue, come_back, report, alert, unsubscribe, maya_daily, maya_weekly, maya_unsubscribe, monthly_summary, monthly_summary_unsubscribe | 2 | 14 | - |
| ActivityKind | src/lib/admin-dashboard.ts:358 | account, test_start, test_finish, card_start, card_saved, paying, cancelled, waitlist, email | 0 | 4 | - |
| ChatFamilyResult | src/lib/admin-maya-chat.ts:47 | ok, not_test_family, not_listed, taken | 0 | 0 | - |
| ProgressPhase | src/lib/admin-progress.ts:47 | question, check, break, facts, finished, closed | 0 | 4 | - |
| AiProvider | src/lib/ai-fallback.ts:18 | subscription, api | 3 | 0 | workbook_run_ai_calls.provider; workbook_workers.primary_ai |
| STATUSES | src/lib/assessment/anonymous-copy.ts:149 | in_progress, completed, expired | 2 | 8 | assessments.status |
| AttemptStatus | src/lib/assessment/attempt.ts:12 | in_progress, completed, expired | 4 | 7 | assessments.status |
| AttemptState | src/lib/assessment/attempt.ts:44 | open, expired, completed | 0 | 5 | - |
| RetentionCardState | src/lib/assessment/deletion.ts:4 | clear, saved, unknown | 2 | 6 | - |
| SkillState | src/lib/assessment/skill-state.ts:62 | mastered, working_on, needs_review, not_started | 5 | 0 | skill_state_history.state |
| SkillStateReason | src/lib/assessment/skill-state.ts:69 | failed_review, secure_on_test, held_on_review, in_workbook, needs_attention_on_test, above_school_grade, early_sign_on_test, developing_on_test, no_evidence | 2 | 1 | skill_state_history.reason |
| Route | src/lib/assessment/types.ts:183 | up, stay, down | 15 | 5 | assessments.route |
| Stage3Direction | src/lib/assessment/types.ts:189 | up, down | 2 | 5 | assessments.route (subset); assessments.stage3_route (subset) |
| StrandStatus | src/lib/assessment/types.ts:225 | secure, developing, needs-attention | 7 | 3 | - |
| InvoiceStatus | src/lib/billing.ts:96 | paid, no_charge, due, not_paid, cancelled | 1 | 1 | - |
| BatchState | src/lib/board-protocol.ts:48 | accepted, shown, presented, cancelled | 0 | 2 | - |
| EndReason | src/lib/board-session.ts:56 | handover, forced, lost, pagehide, close | 0 | 0 | - |
| TabRole | src/lib/board-tab.ts:59 | holder, reader | 1 | 2 | - |
| PlanStartState | src/lib/card-reconcile.ts:75 | open, started, other, refused, team_ended | 1 | 11 | plan_starts.state |
| ChildStage | src/lib/child-stage.ts:8 | ended, active, first_book_coming, test_running, report_ready_bc, report_ready_waitlist, no_test | 2 | 3 | - |
| ChildTab | src/lib/child-stage.ts:11 | overview, progress, workbooks, schedule, scan_pages, maya, assessment, account | 2 | 3 | - |
| FeedbackError | src/lib/feedback.ts:29 | empty, too_long, no_product, invalid, conflict, rate_limited, family_unavailable, child_unavailable, unavailable, signed_out, desk_open | 2 | 9 | - |
| FeedbackAdmission | src/lib/feedback.ts:31 | saved, duplicate, conflict, rate_limited, family_unavailable, child_unavailable | 1 | 8 | - |
| ChannelId | src/lib/heard.ts:5 | friend, search, ai, social, other | 2 | 1 | signup_heard.channel |
| EventResult | src/lib/learning-events.ts:36 | right, wrong, blank, right_with_help | 1 | 16 | learning_events.result |
| EvidenceKind | src/lib/learning-events.ts:38 | call, scan, answer | 1 | 1 | learning_events.evidence_kind |
| LearningError | src/lib/learning-style.ts:92 | bad_json, signed_out, invalid, not_found, store_failed | 1 | 6 | - |
| NOTE_CALL_KINDS | src/lib/maya-call-note.ts:49 | family, chat | 3 | 0 | - |
| NoteStep | src/lib/maya-call-note.ts:510 | done, pending | 2 | 4 | workbook_comments.status (subset) |
| SweepKind | src/lib/maya-call-sweep.ts:85 | live, unfinished | 1 | 0 | maya_call_sweep_cursors.kind |
| CallKind | src/lib/maya-call.ts:97 | admin_test, chat | 1 | 1 | maya_calls.kind |
| CallStatus | src/lib/maya-call.ts:98 | live, ended | 3 | 6 | maya_calls.status |
| FLAG_LEVELS | src/lib/maya-call.ts:104 | unsafe_request, safety_concern, safety_immediate | 1 | 0 | maya_call_alerts.level; maya_calls.flag |
| AlertStatus | src/lib/maya-call.ts:122 | sending, sent, refused, unknown | 3 | 23 | maya_call_alerts.status |
| FreeTalkCallKind | src/lib/maya-free-talk.ts:8 | admin_test, child | 0 | 2 | - |
| MinutesKind | src/lib/maya-minutes.ts:32 | child, parent_demo | 1 | 0 | maya_minute_grants.kind |
| RunStatus | src/lib/maya-practice/practice.ts:361 | pass, fail, invalid, unjudgeable, missing | 3 | 3 | - |
| SpendState | src/lib/maya-spend.ts:58 | open, week_used, paused | 2 | 3 | - |
| ConnectionKind | src/lib/maya-voice.ts:278 | agent_joined, agent_left, child_joined, child_left | 2 | 0 | maya_call_connections.kind |
| Severity | src/lib/maya/proposal.ts:23 | concern, immediate | 4 | 5 | maya_calls.safety_severity |
| Reason | src/lib/maya/session.ts:100 | solved, child_stopped, time_limit, no_response, technical_issue, content_issue, safety | 7 | 5 | maya_calls.outcome_reason |
| PaperStatus | src/lib/maya/session.ts:104 | child_confirmed, declined, unknown | 1 | 0 | maya_calls.paper_status |
| NextStepError | src/lib/next-step.ts:22 | bad_json, signed_out, invalid, not_found, store_failed | 4 | 6 | - |
| ActionItem | src/lib/parent-view.ts:302 | start_test, continue_test, payment_failed, no_pin, learning_card_empty | 1 | 1 | - |
| PlanAccessReason | src/lib/plan-access.ts:20 | open, ending_until_end, no_plan, ended, payment_failed, paused, unknown, read_failed | 0 | 15 | - |
| PLAN_READ_KINDS | src/lib/plan-state.ts:128 | free_month, paying, ending, payment_failed, paused | 3 | 9 | child_plan_states.kind (subset) |
| StartKind | src/lib/reminder-schedule.ts:22 | start, start_followup | 1 | 3 | email_log.kind (subset) |
| UnsubscribeState | src/lib/reminder-store.ts:234 | subscribed, unsubscribed, unknown | 1 | 1 | - |
| REMINDER_KINDS | src/lib/reminders.ts:17 | continue, come_back, start, start_followup | 1 | 3 | email_log.kind (subset) |
| LogStatus | src/lib/reminders.ts:26 | claimed, sent, failed | 3 | 21 | email_log.status; scan_link_emails.status |
| NextStepKey | src/lib/report-view.ts:371 | plan, waitlist | 1 | 1 | - |
| DELIVERY_TYPES | src/lib/resend-webhook.ts:36 | delivered, delivery_delayed, bounced, complained, failed, suppressed | 0 | 3 | email_events.type |
| HistoryStatus | src/lib/scan-history.ts:3 | never-scanned, pending, review, failed, blank, unscored, ready | 1 | 24 | - |
| ScanLinkResult | src/lib/scan-link.ts:35 | sent, not_found, too_many, unsure, failed | 0 | 24 | - |
| ChildPlanReason | src/lib/scan-marking-access.ts:22 | open, ending_until_end, no_plan, ended, payment_failed, paused, unknown, read_failed | 1 | 15 | - |
| MethodVerdict | src/lib/scan-marking-methods.ts:34 | valid, invalid, unknown | 0 | 3 | - |
| MarkingStatus | src/lib/scan-marking.ts:55 | finished, pending, busy, terminal, unavailable, off, budget, price-unverified, attempts | 0 | 19 | - |
| MarkResult | src/lib/scan-observation.ts:32 | right, wrong, blank | 5 | 16 | learning_events.result (subset); workbook_second_tries.result |
| ObservationState | src/lib/scan-observation.ts:41 | pending, scored, parent-pending, parent-checked, unscored | 0 | 6 | - |
| HelpState | src/lib/scan-observation.ts:70 | none, math-help, unknown | 1 | 5 | workbook_second_tries.help |
| Actor | src/lib/scan-observation.ts:71 | system, parent, admin | 1 | 5 | - |
| CheckState | src/lib/scan-stack.ts:12 | none, checking, ready, refused, unavailable | 0 | 16 | - |
| TileStatus | src/lib/scan-stack.ts:51 | adding, checking, ready, saved, refused, unavailable, sent | 0 | 36 | - |
| LinkState | src/lib/sign-in-link.ts:28 | valid, used, expired, unknown | 1 | 2 | - |
| SignupStatus | src/lib/signup.ts:26 | reserved, waitlist | 0 | 3 | signups.status |
| AssessmentStatus | src/lib/test-api.ts:10 | in_progress, completed, expired | 6 | 8 | assessments.status |
| TestError | src/lib/test-api.ts:12 | signed_out, bad_json, invalid, not_found, not_ready, conflict, incomplete, expired, retake_closed, work_too_big, store_failed | 4 | 7 | - |
| WorkbookRunner | src/lib/workbook-ai.ts:29 | mac, server | 0 | 0 | workbook_edits.runner; workbook_runs.runner |
| AiCallKind | src/lib/workbook-ai.ts:72 | write, solve | 2 | 0 | workbook_edit_calls.kind; workbook_run_ai_calls.kind |
| CommentRoute | src/lib/workbook-comment-route.ts:4 | question, layout | 3 | 2 | workbook_comments.route; workbook_edits.edit_kind |
| WorkbookStatus | src/lib/workbook-content.ts:55 | draft, approved, printed, shipped | 7 | 12 | workbooks.status |
| WorkbookNoticeKind | src/lib/workbook-email.ts:6 | welcome, ready, dispatch | 2 | 3 | workbook_emails.kind (subset) |
| WorkbookEmailStatus | src/lib/workbook-email.ts:9 | pending, sending, sent, failed, unknown, skipped | 3 | 30 | workbook_emails.status |
| RunStatus | src/lib/workbook-job.ts:85 | queued, running, done, failed, stale | 3 | 14 | workbook_runs.status |
| RunStep | src/lib/workbook-job.ts:86 | plan, write, render, save | 1 | 1 | workbook_runs.step |
| RunRunner | src/lib/workbook-job.ts:126 | server, mac | 4 | 0 | workbook_edits.runner; workbook_runs.runner |
| StopResult | src/lib/workbook-job.ts:151 | stopped, already, done, failed, stale, not_found | 0 | 14 | - |
| JobOutcome | src/lib/workbook-job.ts:378 | done, failed, stale, handed-on, not-claimed | 3 | 9 | - |
| RunState | src/lib/workbook-job.ts:410 | waiting, preparing, stopped, failed, done | 1 | 12 | - |
| ScanClockWriteStatus | src/lib/workbook-scan-clock.ts:13 | waiting, hold, claimed, missing-delivery, unavailable, stale-delivery, calendar-conflict | 1 | 5 | - |
| SolveState | src/lib/workbook-solve-summary.ts:9 | agreed, disagreed, errored, not-checked | 1 | 3 | - |

#### 2b-ii. Vocabulary unions found by the same scan that are not lifecycle states (generator kinds, UI geometry, model reasons; listed for completeness, 43)

| type / const | file:line | values | other files naming it | other files comparing >=2 of its literals | mirrors SQL check |
|---|---|---|---|---|---|
| Kind | src/components/guidance-demo.tsx:23 | wide, board | 8 | 0 | - |
| Mode | src/components/scan-pages.tsx:21 | phone, desktop | 3 | 1 | - |
| STEPS | src/components/whats-included-scan.tsx:8 | cam, mkg, res | 2 | 0 | - |
| Choice | src/components/workbook-instructions-form.tsx:23 | usual, more, less | 4 | 0 | - |
| PagedTable | src/lib/admin-export.ts:20 | assessments, children | 2 | 0 | - |
| TestTable | src/lib/admin-export.ts:22 | answers, question_shows, assessment_facts, fact_answers, learner_profiles | 1 | 0 | - |
| UnavailableReason | src/lib/ai-claude-cli.ts:30 | limit, missing, logged-out, crash, images | 2 | 0 | - |
| DisagreementKind | src/lib/area-level-check.ts:17 | invented-weakness, overstated, no-status | 0 | 0 | - |
| AUTH_EMAIL_KINDS | src/lib/auth-email.ts:3 | confirmation, magic_link, recovery | 0 | 0 | - |
| RowKind | src/lib/board/division.ts:42 | quotient, bring, product, difference, remainder | 0 | 1 | - |
| REGROUP_KINDS | src/lib/board/types.ts:40 | carry, borrow | 1 | 1 | - |
| FRACTION_PARTS | src/lib/board/types.ts:109 | numerator, denominator, bar, whole_number | 1 | 1 | - |
| PathKind | src/lib/board/types.ts:206 | glyph, rule, strike, arrow, highlight, circle, underline, check | 2 | 3 | - |
| ConsentChoice | src/lib/consent.ts:13 | granted, denied | 0 | 1 | - |
| GeneratedLevel | src/lib/maya-practice/generated.ts:17 | U4, U16 | 0 | 0 | - |
| OBLIGATION_KINDS | src/lib/maya-trace.ts:35 | start_pending, safety_due, opening_due, repair_due, child_turn_pending, content_problem | 0 | 0 | - |
| AttemptSource | src/lib/maya-trace.ts:51 | model, repair, fallback, controller | 0 | 5 | - |
| INFERENCE_STT_MODELS | src/lib/maya-voice.ts:125 | assemblyai/universal-3-6-pro, assemblyai/universal-3-5-pro, assemblyai/universal-streaming, deepgram/flux-general-en | 0 | 0 | - |
| SCOPE_REASONS | src/lib/maya/scope.ts:7 | outside_work, other_person, changed_problem, other_topic, unverified_request, model_scope | 2 | 1 | - |
| OutsideReason | src/lib/maya/scope.ts:9 | outside_work, other_person, other_topic | 2 | 1 | - |
| MAIN_STATES | src/lib/maya/session.ts:85 | READY, OPEN, ASSESS, MODEL_EXAMPLE, TRY_TARGET, GUIDE_TARGET, CHECK, WRITE_CLOSE, CLOSE, CONTENT_HOLD | 2 | 1 | - |
| TABLES | src/lib/parent-view-memory.ts:114 | children, tests, reports, cards, deliveries, workbooks, plans, switches, corrections, dispatches, family, results, scans, pages, learning, pin, maya, skillTests, quest... | 0 | 2 | - |
| AlgebraKind | src/lib/question-package-algebra.ts:429 | evaluate, solve | 0 | 3 | - |
| MeasureKind | src/lib/question-package-measures.ts:561 | convert, quantity-add, quantity-subtract, quantity-multiply, money-round, elapsed-time, time-add, clock-convert | 0 | 1 | - |
| UnavailableReason | src/lib/question-package.ts:616 | unsupported-template, invalid-package | 2 | 0 | - |
| TeamReason | src/lib/scan-marking-comparison.ts:289 | two-ways-method-marks-off, team-method | 0 | 0 | - |
| MODEL_READING_ISSUES | src/lib/scan-observation.ts:45 | unreadable, crossed-out, multiple-marks, missing, blurry, cut-off, incomplete, answer-form, method-form | 1 | 0 | - |
| DownDecision | src/lib/whiteboard.ts:76 | draw, ignore, replace | 0 | 2 | - |
| FIGURE_KINDS | src/lib/workbook-generator-items.ts:73 | dots, ten-frame, number-line, base-ten, array | 0 | 6 | - |
| OPERATION_KINDS | src/lib/workbook-generator-items.ts:77 | add, subtract, missing-addend, multiply, divide, decimal-add, decimal-subtract, decimal-multiply, fraction-add, fraction-subtract, fraction-multiply, fraction-divide, ... | 0 | 22 | - |
| QUESTION_KINDS | src/lib/workbook-generator.ts:998 | story, picture, fact, missing-part, sequence, order, relation, pattern, draw | 0 | 13 | - |
| LIKELIHOOD_CHOICES | src/lib/workbook-likelihood.ts:10 | never, sometimes, always | 0 | 0 | - |
| FactState | src/lib/workbook-personal-items.ts:101 | known, needs-practice, not-measured | 0 | 1 | - |
| PART_KINDS | src/lib/workbook-plan.ts:102 | warm-up, in-your-head, fix-it, remember-these, try-first, new-idea, spot-the-error, practice, solve-it-two-ways, word-problems, picture-stories, math-in-the-world, mix... | 0 | 16 | - |
| DayKind | src/lib/workbook-plan.ts:306 | teach, remember, test, light, mixed | 0 | 2 | - |
| MasteryReason | src/lib/workbook-print-contract.ts:84 | not-scorable, parent-checked, try-first, no-item-step | 0 | 2 | - |
| ProgressAction | src/lib/workbook-progress.ts:88 | retain-unfinished, advance, skill-complete, repeat-new-numbers, regress-represent, repeat-check-work, retain-review, change-approach | 0 | 1 | - |
| SampleBookKind | src/lib/workbook-sample-profiles.ts:14 | first, second, test | 0 | 1 | - |
| kinds | src/lib/workbook-scan-reminder-store.ts:13 | unseeded, due, inactivity, reminder-due | 34 | 0 | - |
| StepItemKind | src/lib/workbook-step-items.ts:28 | box, story, choice, spot, two-ways, sequence, mixed | 0 | 23 | - |
| Action | src/lib/workbook-wording.ts:16 | join, separate, part, compare, frame, groups, share | 2 | 1 | - |
| WordedKind | src/lib/workbook-wording.ts:18 | add, subtract, missing-addend, multiply, divide | 0 | 18 | - |
| WordingKind | src/lib/workbook-wording.ts:20 | story, picture, fact, missing-part, line | 2 | 2 | - |

### 2b-iii. Inline unions in interface fields (73 fields, scan of `status|state|kind|step|phase|outcome|verdict|stage` fields with 3 or more string values)

| field | file:line | values |
|---|---|---|
| status | src/app/api/admin/scans/marks/route.ts:6 | conflict, not_waiting, no_photo |
| stripeState | src/app/api/signup/route.ts:69 | sent, off, failed |
| stripeState | src/app/api/signup/route.ts:101 | sent, off, failed |
| status | src/lib/account-server.ts:19 | exists, busy, unavailable, failed |
| kind | src/lib/admin-dashboard.ts:23 | continue, come_back, start, start_followup, unsubscribe, maya_daily, maya_weekly, maya_unsubscribe, monthly_summary, monthly_summary_unsubscribe |
| status | src/lib/admin-dashboard.ts:23 | claimed, sent, failed |
| outcome | src/lib/admin-dashboard.ts:158 | sent, refused, unknown |
| status | src/lib/admin-dashboard.ts:178 | sent, failed, pending |
| outcome | src/lib/admin-store.ts:798 | started, answered, failed, unavailable |
| kind | src/lib/admin-store.ts:897 | continue, come_back, start, start_followup, unsubscribe, maya_daily, maya_weekly, maya_unsubscribe, monthly_summary, monthly_summary_unsubscribe |
| status | src/lib/admin-store.ts:898 | claimed, sent, failed |
| kind | src/lib/admin-view.ts:152 | slip, misunderstanding, none |
| outcome | src/lib/ai-fallback.ts:31 | started, answered, failed, unavailable |
| status | src/lib/assessment/anonymous-copy.ts:117 | in_progress, completed, expired |
| state | src/lib/assessment/deletion.ts:18 | busy, excluded, plan_start |
| kind | src/lib/assessment/report.ts:20 | slip, misunderstanding, none |
| state | src/lib/card-reconcile.ts:154 | sent, unknown, released |
| outcome | src/lib/child-profile.ts:357 | off, no_events, kept |
| state | src/lib/database.ts:65 | running, ready, refused |
| kind | src/lib/database.ts:74 | generated, edit, redo-page |
| save_child_plan_state | src/lib/database.ts:154 | p_next_charge_at, p_ends_at, p_monthly_cents, p_event_at, p_event_id |
| kind | src/lib/desk.ts:63 | add, subtract, multiply |
| state | src/lib/email-delivery-memory.ts:44 | claimed, sent, refused, unknown |
| state | src/lib/family-delete-server.ts:103 | deleted, queued, not_queued, plan_start |
| state | src/lib/family-deletion-store.ts:312 | ready, busy, excluded, plan_start |
| status | src/lib/flyers.ts:102 | need-delivered, check-delivered, no-signups, too-early, leaning, clear, even |
| status | src/lib/maya-call.ts:315 | saved, busy, closed, gap, not_found |
| status | src/lib/maya-practice/generated.ts:20 | teachable, held, rejected |
| stage | src/lib/maya-practice/practice.ts:579 | code, validity, full |
| status | src/lib/maya-trace.ts:45 | pending, served, dropped |
| kind | src/lib/maya/session.ts:1874 | math, plain, warm, talk |
| status | src/lib/parent-problem-explanation-contract.ts:3 | refused, unavailable, busy, retry, cap |
| status | src/lib/parent-problem-explanation.ts:67 | refused, cap, unavailable |
| kind | src/lib/parent-workbook-answers.ts:23 | fixed, example, open, unavailable |
| state | src/lib/plan-pause.ts:42 | open, applied, refused |
| outcome | src/lib/plan-pause.ts:85 | applied, refused, pending |
| kind | src/lib/question-package-algebra.ts:474 | substitute, operate, inverse, check |
| status | src/lib/question-package-items.ts:61 | failed, unsupported, not-checked |
| kind | src/lib/question-package-measures.ts:655 | convert-unit, round-cash, count-on, add-durations, clock-change |
| state | src/lib/scan-crops-memory.ts:8 | pending, saved, deleted, expired, rejected |
| state | src/lib/scan-crops.ts:101 | running, ready, refused |
| status | src/lib/scan-crops.ts:110 | busy, ready, refused, terminal, unknown |
| status | src/lib/scan-history.ts:13 | all, review, failed |
| status | src/lib/scan-link-memory.ts:13 | claimed, sent, failed |
| state | src/lib/scan-marking-comparison.ts:84 | written, blank, uncertain |
| status | src/lib/scan-marking-comparison.ts:224 | complete, failed, deferred |
| status | src/lib/scan-marking-launch.ts:17 | pending, approved, deferred |
| status | src/lib/scan-marking-physical.ts:29 | ready, refused, incomplete |
| verdict | src/lib/scan-observation.ts:84 | solves, does-not-solve, unsure |
| status | src/lib/scan-observation.ts:261 | complete, incomplete, no-items |
| status | src/lib/scan-stack.ts:36 | waiting, uploading, refused |
| status | src/lib/scan-team-marks.ts:30 | conflict, not_waiting, no_photo |
| kind | src/lib/workbook-ai-fake.ts:17 | add, subtract, missing-addend |
| kind | src/lib/workbook-curriculum/expression.ts:137 | list, set, tuple |
| status | src/lib/workbook-edit-memory.ts:9 | draft, approved, printed, shipped |
| status | src/lib/workbook-edit-progress.ts:4 | queued, running, done, failed |
| phase | src/lib/workbook-edit-progress.ts:5 | waiting, working, retrying, stalled, saving, done, failed |
| status | src/lib/workbook-edit.ts:17 | pending, sent, done, failed, stale |
| status | src/lib/workbook-edit.ts:25 | queued, running, done, failed |
| status | src/lib/workbook-email-server.ts:75 | sent, failed, unknown |
| kind | src/lib/workbook-generator-items.ts:886 | add, subtract, missing-addend |
| kind | src/lib/workbook-generator.ts:992 | add, subtract, missing-addend |
| status | src/lib/workbook-job-store.ts:57 | started, busy, stalled |
| kind | src/lib/workbook-layout-check.ts:63 | row, label, box |
| status | src/lib/workbook-layout-edit.ts:11 | applied, partial, unsupported |
| kind | src/lib/workbook-personal-items.ts:168 | add, subtract, multiply, divide |
| status | src/lib/workbook-progress.ts:95 | excluded, missing-context, missing, pending, resolved |
| kind | src/lib/workbook-quality.ts:23 | repeat, progress, variety, time, coverage, challenge, step, range |
| phase | src/lib/workbook-scan-reminder-send.ts:58 | reserved, admission-attempted, admitted, closed |
| status | src/lib/workbook-signals.ts:12 | used, not-used, missing |
| status | src/lib/workbook-signals.ts:18 | secure, developing, needs-attention |
| state | src/lib/workbook-signals.ts:34 | known, needs-practice, not-measured |
| verdict | src/lib/workbook-solve-summary.ts:25 | agreed, disagreed, failed |

Notable copies in this list: `kind` at src/lib/admin-dashboard.ts:23 and src/lib/admin-store.ts:897 (email kinds, both missing `scan_inactivity`), `status` at src/lib/admin-dashboard.ts:23 and :178, admin-store.ts:898 (claimed, sent, failed again), `outcome` at src/lib/admin-store.ts:798 and src/lib/ai-fallback.ts:31 (started, answered, failed, unavailable twice), `state` at src/lib/database.ts:65 and src/lib/scan-crops.ts:101 (running, ready, refused twice), `status` at src/lib/scan-link-memory.ts:13 and src/lib/scan-crops.ts:110.

### 2b-iv. SQL checks with no equal TS union (candidates for hand-copied raw literals)

Computed by comparing each SQL value set with every union in 2b and 2b-iii: 55 of 103 comparable checks have an exact TS twin, 10 have a near twin (listed next), 38 have none (second list). "None" is approximate: a province list can be typed through `keyof typeof CURRICULA` and then not be seen by the scan.
Near twins (value sets differ): scan_photos.state vs src/lib/scan-crops-memory.ts:8 (adds deleted, expired, rejected); child_plan_states.kind vs `PLAN_READ_KINDS` src/lib/plan-state.ts:128 (omits ended, not_started, by design); assessments.stage3_route vs `Stage3Direction` (omits none); plan_starts.email_send_status and plan_starts.team_alert_state vs `WorkbookEmailStatus` src/lib/workbook-email.ts:9 (different sets: pending and skipped exist only there); plan_starts.state (started, other part) vs `PlanStartState`; workbook_emails.kind vs `WorkbookNoticeKind` src/lib/workbook-email.ts:6 (omits plan_start); email_log.kind vs the two inline copies (omit scan_inactivity); scan_mark_changes.actor (parent, admin) vs `Actor` src/lib/scan-observation.ts:71 (adds system).
No equal TS union found for: signups.plan/subject/curriculum/booking_state, assessments.province, children.province, anonymous_tests.province, waitlist_joins.province, family_deletions.reason/phase, family_payment_operations.kind/outcome, card_setups.plan, work_reviews.confidence, email_copies.report_email, children.math_feeling/learning_goal/weekly_time, learning_events.question_source, maya_calls.mode/question_source, maya_call_notes.writer, workbook_edits.action, plan_control_operations.kind, plan_starts.purpose, maya_spend.charge, scan_marking_jobs.state/blocked_reason, workbook_emails.kind (welcome, plan_start part), workbook_scan_trigger_claims.reason, feedback.product/source/status, workbook_scan_reminder_messages.state, workbook_scan_reminder_attempts.state, workbook_book1_baselines.planning_kind, workbook_plan_previews.engine. (Several of these are handled in TS by inline string compares or by `Database[...]["Row"]` types from src/lib/database.types.ts, which is generated; the generated type is `string` for plain `text` columns, so no compile-time check covers them. src/lib/database.ts `ColumnTypes` adds literal types only for the columns listed there: e.g. `email_log: { kind: LogKind; ... }` at database.ts:48, `ad_visit_steps: { step: AdStep }` at :40.)

## 2c. Duplicated status literals (counts per literal, non-test src files)

Method: python over the 977 non-test src files; columns: files that compare the literal with `===`, `!==`, `==`, `!=` or `case` (compare-ts); files that filter the database with `.eq/.neq/.is/.in` on a status-like column (db-filter-ts); files that assign `status|state|outcome|phase|step: "lit"` (assign-ts); union of the three (ts-any); migration files where the literal sits next to a `status|state|outcome|phase|step` comparison (sql-migrations). One literal belongs to many different machines, so this counts spread of the SPELLING, not of one status. Command to repeat one row: `rg -n --glob '!*.test.*' --glob '!database.types.ts' -e '(===|!==|case)\s*"stale"' -e '"stale"\s*(===|!==)' src`.

| literal | compare-ts | db-filter-ts | assign-ts | ts-any | sql-migrations |
|---|---|---|---|---|---|
| refused | 50 | 1 | 42 | 72 | 11 |
| failed | 53 | 4 | 23 | 68 | 29 |
| sent | 42 | 2 | 19 | 54 | 23 |
| saved | 42 | 2 | 19 | 50 | 13 |
| unavailable | 31 | 0 | 15 | 42 | 2 |
| unknown | 28 | 0 | 16 | 41 | 10 |
| busy | 28 | 0 | 9 | 34 | 0 |
| ready | 25 | 1 | 13 | 32 | 9 |
| shipped | 24 | 6 | 3 | 32 | 32 |
| pending | 23 | 3 | 7 | 28 | 23 |
| open | 24 | 2 | 5 | 28 | 6 |
| started | 16 | 1 | 13 | 26 | 7 |
| ended | 22 | 2 | 1 | 24 | 17 |
| done | 19 | 1 | 4 | 22 | 11 |
| completed | 15 | 7 | 1 | 21 | 4 |
| running | 13 | 4 | 8 | 20 | 35 |
| expired | 13 | 2 | 3 | 16 | 5 |
| claimed | 6 | 2 | 10 | 14 | 9 |
| paused | 12 | 0 | 2 | 14 | 0 |
| live | 10 | 1 | 3 | 12 | 6 |
| printed | 10 | 1 | 0 | 11 | 16 |
| queued | 9 | 1 | 4 | 10 | 18 |
| stale | 9 | 0 | 2 | 10 | 12 |
| paying | 10 | 0 | 0 | 10 | 0 |
| cancelled | 9 | 0 | 2 | 10 | 0 |
| scored | 7 | 0 | 4 | 10 | 0 |
| in_progress | 6 | 2 | 4 | 9 | 11 |
| reserved | 8 | 0 | 3 | 9 | 7 |
| draft | 6 | 0 | 3 | 8 | 11 |
| sending | 5 | 1 | 2 | 7 | 7 |
| released | 6 | 0 | 1 | 7 | 2 |
| finished | 5 | 0 | 1 | 6 | 4 |
| skipped | 6 | 0 | 1 | 6 | 4 |
| stopped | 5 | 0 | 2 | 6 | 0 |
| approved | 4 | 0 | 4 | 5 | 6 |
| applied | 4 | 0 | 3 | 5 | 4 |

Spot checks (rg evidence, comparison forms only, non-test src):
- `"stale"`: 9 files, 12 hits, and they are 5 different machines: workbook runs (src/lib/workbook-job.ts:415, src/lib/workbook-job-store.ts:155, src/components/stop-workbook-run.tsx:27), workbook comments (src/lib/workbook-comment-route.ts:39, src/components/workbook-comment-reviewer.tsx:200), scan reminders (src/lib/workbook-scan-reminder-store.ts:111,214,222), scan problem explanation UI (src/components/scan-problem-explanation.tsx:12,20), scan crops (src/lib/scan-crops.ts:250) and plan UI (src/components/account-plan.tsx:97).
- `"queued"`: 10 files; the run/edit queue alone is compared in src/app/api/admin/workbooks/runs/[id]/edit/route.ts:74-75, src/components/admin-workbook-runs.tsx:57, src/lib/workbook-edit-memory.ts:14,49,96, src/lib/workbook-job.ts:416,419, src/lib/workbook-job-store.ts:205,213,216-219, src/components/workbook-comment-reviewer.tsx:67,130, src/lib/workbook-edit-progress.ts:37,40, src/lib/workbook-job-memory.ts:70,74,186,250. "Is this run active" is spelled `status === "queued" || status === "running"` in at least 6 of these places (admin-workbook-runs.tsx:57, workbook-edit-memory.ts:14, workbook-comment-reviewer.tsx:67, workbook-edit-progress.ts:37, workbook-job-memory.ts:70, workbook-job-store.ts:213 as `.in("status", ["queued","running"])`).
- `"refused"` is the most copied: 181 `'status','refused'` returns in SQL (28 migration files) and 50 compare files in TS.

## 2d. SQL functions that return a `'status'` string (RPC vocabularies without a check)

Counts from `'status', '<word>'` inside `jsonb_build_object` and similar: 56 distinct words, 449 occurrences (superseded function versions included), in 48 of the 230 migration files. TS reads them as `answer === "..."` or `data.status === "..."` with no shared type. Top of the list (word xN occurrences, files): refused x181 (28), unavailable x37 (9), conflict x28 (9), saved x27 (15), busy x21 (14), done x12 (12), started x11 (9), not_found x10 (4), accepted x8 (3), stale x8 (2), unknown x6 (6), terminal x6 (6), written x5 (4), missing x5 (2), approved x4 (4), none x4 (2), queued x4 (4), found x4 (2), duplicate x4 (2), then 36 words used 1 to 3 times (route, marked, window, cap, claimed, layout-review, recorded, set-changed, not_waiting, stalled, missing_body, confirmed, corrected, closed, gap, missing-delivery, waiting, calendar-conflict, exists, created, invalid, stopped, limit, dispatch, clock-required, hold, stale-delivery, body, read, unsubscribed, refresh-required, ready, released, not-due, changed, admitted, no_photo).
Examples of the TS side mirroring them by hand: `StopResult` (src/lib/workbook-job.ts:151) = stopped, already, done, failed, stale, not_found; `Admission` (src/lib/account-server.ts:19) = created, exists, busy, unavailable, failed; `FeedbackAdmission` (src/lib/feedback.ts:31); `MarkingStatus` (src/lib/scan-marking.ts:55). `database.ts` `ColumnTypes` / `NullArgs` carry no RPC return types.

## 2e. Observations for whoever picks the next target (facts only, no fixes)
- Three machines already have the shape the repo's own AGENTS.md praises (pure core, store seam, memory twin): test attempt, board history, child stage. Almost every other status machine in this sweep keeps its rule in a mix of SQL function bodies and scattered TS comparisons.
- The largest spelling clusters are refused/failed/sent/saved (send and save outcomes) and the run/edit queue words (queued/running/done/failed/stale).
- Hand-copied enums with a proven drift today: `email_log.kind` (finding 1). Likely next drift sites by the same pattern: `workbook_emails.kind` (3 near copies), `plan_starts.*_state` (3 near copies).
