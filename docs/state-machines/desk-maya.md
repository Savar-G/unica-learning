# Inventory: THE CHILD'S DESK, PARENT PIN, MAYA, BOARDS

Branch checked: `site/state-machines` (git branch --show-current), HEAD 724f38b4. Read only. Nothing was run (no tests, no build). Test counts below are `rg -c "^\s*(it|test)\("` line counts, not executed results.
Paths are relative to /Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/site-state-machines.

## Top findings

1. **Lying admin screen (verified by reading).** An ended call that legitimately wrote no learning event (`learningEvent()` returns null when `session.startedAt === null`, `src/lib/maya/session.ts:496-497`; also the `noEvent`/`cancelled` path, `src/lib/maya-call.ts:862`) shows "Saved to child's record: Not yet", "Child's profile updated: Not yet" and a "Try saving again" button for ever (`src/components/admin-maya.tsx:559-567`). The retry runs `afterEnd`, which does nothing for such a call. The screen reads `learningEventId === null` as "failed", but null is also a final good state.
2. **Two different "is the desk open" checks.** `src/app/api/account/maya-notice/route.ts:16` uses `readLock(cookie)` (any lock, any parent). The proxy and four other routes use `deskGate(...)`, which compares the lock's parent with the session's parent (`src/lib/desk.ts:47-59`). On a shared device, a stale desk cookie of parent A makes parent B's notice POST answer raw JSON `423 desk_open` (a dead end in a form post), although the proxy let it through. The route's test covers only the same-parent cookie (`src/app/api/account/maya-notice/route.test.ts:49-52`). The desk rule is copied or re-derived in about 12 files (machine 1).
3. **Desk chat shows one generic error for every refusal.** `useDeskChat.request` throws `ERROR` ("Your message could not be sent. Try again in a moment.", `src/components/desk-chat.tsx:8`) for any `answer.error` except `cap`, `week_used`, `paused` (line 295). `notice_required` (notice version raised while a desk is open, `src/lib/maya-chat-server.ts:194`), `window`, `conflict`, `invalid_question` and `not_found` all show it, so a child retries a request that can never pass.
4. **Dead value `'family'` in 8 migration files and 1 TS list.** `maya_calls_kind_check` allows only `('admin_test','chat')` (`supabase/migrations/20261102171510_desk_maya_chat.sql:3`). Yet `NOTE_CALL_KINDS = ["family","chat"]` (`src/lib/maya-call-note.ts:49`) and these migrations test `kind in ('family','chat')` or `kind = 'family'`: `20261101_add_maya_call_notes`, `20261101_maya_recap_call_coverage`, `20261102171510_desk_maya_chat`, `20261102173557_desk_maya_chat_recap`, `20261103000100_parent_maya_note_sessions`, `20261105073754_maya_chat_families`, `20261105081527_maya_chat_rehearsal_guard`, `20261105124144_maya_chat_lock_order` (several are superseded by later versions). The header of `maya-call.ts:1-4` and `20261031_add_maya_calls.sql` still says "only admin test calls exist".
5. **"Unfinished call" is defined 3 times by hand.** TS `unfinished()` (`src/lib/maya-call-sweep.ts:124`), the PostgREST string `UNFINISHED` (`src/lib/maya-call-store.ts:206`) and the partial index predicate (`supabase/migrations/20261105074521_maya_calls_unfinished_index.sql:6`). Nothing links them; a change to one silently breaks the sweep's index use or its meaning.
6. **Call lifecycle has no DB transition guard.** `maya_calls.status` is written by `CallStore.update(id, revision, change)` with only a revision compare-and-set (`src/lib/maya-call-store.ts:143-152`). No trigger blocks `ended -> live`; "a flag only rises" is TS only (`risen`, `src/lib/maya-call.ts:648`). Safety is stored twice: outcome columns (`safety_flag`, `safety_severity`) and `flag`/`flagged_at`; `listCalls` reconciles them with four filter groups (`src/lib/maya-call-server.ts:181-186`, "a call saved before flags existed").
7. **PIN lock is shared by the child and the parent, and uses the app clock.** `claim_pin_attempt` counts every try on the one row, so a child at the desk can use 5 tries and lock the parent out for 15 minutes (escape: Forgot PIN has its own counter, `reset_*` columns). The lock end is computed from `p_now` passed by the app (`src/lib/parent-pin-store.ts:33`, `Date.now`), while AGENTS.md says the family delete code moved to the database clock.
8. **Maya minutes ledger is dormant.** `grantChild`/`grantDemo` have no caller outside tests (rg over non-test `src`); `counts_minutes` is never written true; voice calls are admin-only. Yet `src/lib/parent-view-server.ts:146` counts `maya_minute_grants` rows for the monthly summary, and the settle trigger fires on every call update. Built, tested (20 test lines), unused. (Whether production has any grant row is unverified.)

Notes outside the top 8: stale `sending` alert claims are shown as `unknown` by TS only; the DB row stays `sending`, and the migration comment (`20261101_add_maya_call_flags.sql`) still says a claim older than 10 minutes may be claimed again, while the store only re-claims `refused` (`src/lib/maya-call-alert-store.ts:51-57`). A chat message with a null `body` (legacy row only, unverified) keeps the chat `busy` until the sweep ends it.

## Contents

1. Desk lock (cookie, proxy gate, guard, BroadcastChannel)
2. Proxy request gate (deletion state x desk gate x scan route)
3. Desk page view (no-workbook / awaiting-delivery / ready / failed)
4. Parent PIN: leave check (attempt counter and lock)
5. Parent PIN: Forgot PIN reset counter, and set/change
6. Maya notice acceptance
7. Maya chat access gate
8. Maya call record (live / ended)
9. Call end pipeline (event, rebuild, note_pending, live retention)
10. Parent note (maya_call_notes)
11. Call flag and alert ledger
12. Abandoned-call sweep and its cursors
13. Chat message admission and lease (maya_chat_messages)
14. Chat ink log: server append and device outbox
15. Desk chat client flow (useDeskChat)
16. Voice call (record, worker handle, connections, token)
17. Maya minutes ledger
18. Maya spend reservations
19. Maya session controller (in flight)
20. Board history (pen holder, drafts)
21. Board tab (holder / reader / lease)
22. Board session (endHolding)
23. Board batch protocol (sender / receiver)
24. Admin chat family list and rehearsal family
25. Voice worker (dormant)

The board modules (20-22) are the repo's model pattern; see "Model pattern" at the end.

---

### 1. Desk lock (cookie, proxy gate, guard, BroadcastChannel)
- Entity / storage: no table. One httpOnly cookie `unica_desk` = `<parent uuid>.<child uuid>`, 30 days (`src/lib/desk-server.ts:13-17`, `src/lib/desk.ts:27`). Browser side: BroadcastChannel and localStorage key `unica-desk`, and `<html data-desk-hidden>` (`src/lib/desk-guard.ts:9-19`).
- States: (a) no cookie: no desk. (b) cookie names the signed-in parent: desk open for that child. (c) cookie names another parent, or no session: lock is latent, everything passes (`deskGate`, `src/lib/desk.ts:47-59`). (d) session unreadable (`sessionKnown=false`): closed to account pages; only `/sign-in` and `/start` pass. (e) page restored from history: hidden until `/api/desk/state` answers (`desk-guard.ts:44-50`).
- Transitions:
  - none -> open: `POST /api/desk/open` (form from Parent home or a page QR code). Needs same origin, signed-in parent, own child, a PIN set (else redirect to `/account/pin?desk=1`), and for a Maya-eligible family the notice agreed or `maya=later` (`src/app/api/desk/open/route.ts:15-43`). Sets the cookie.
  - open (child A) -> open (child B): refused; redirect to the desk (`open/route.ts:27`). Switching needs the PIN to close first.
  - open -> none: `POST /api/desk/leave` with the right PIN (`leave/route.ts:12-28`), or `POST /api/desk/forgot-pin` with the account password (`forgot-pin/route.ts:12-24`). Both call `closeDesk`. Nothing else clears it. Sign-out does not (the lock goes latent, case c).
  - open -> expired: cookie `maxAge` 30 days; `open` again re-sets it (renews 30 days).
  - Tabs: the desk tab posts `desk-opened` (`AnnounceDesk`, `src/components/desk-guard.tsx:53-64`); other parent tabs run `leave()` = hide + `location.replace('/tutor')`.
- Where rules live: `deskGate` (`src/lib/desk.ts:47`) is the rule. Callers or copies: `src/proxy.ts:47`; `src/app/api/desk/state/route.ts:11`; `account/(dashboard)/schedule/page.tsx:18`; `account/(dashboard)/feedback/page.tsx:15`; `api/account/feedback/route.ts:14`; `api/account/scans/[id]/explanation/route.ts:13`; `api/account/children/[id]/monthly-summary/route.ts:27`. `readLock` alone, no parent compare: `api/account/maya-notice/route.ts:16`, `tutor/page.tsx:44`, `tutor/p/[token]/page.tsx:35`, `lib/desk-chat-request.ts:20`, `api/desk/open/route.ts:21`. `rg -l "DESK_COOKIE|readLock|deskGate" src` = 20 files incl. tests. The proxy matcher (`src/proxy.ts:105-110`) is the other half.
- DB enforcement: none. The cookie is the whole state (spec: a convenience, not a security boundary, `desk.ts:11-14`). Only the PIN row relates to it.
- Impossible / unhandled states: cookie names a deleted child: `/tutor` renders the desk with "Your workbook cannot be shown", Leave still works (`tutor/page.tsx:67-77`). Cookie of parent A with parent B signed in: lock latent, but the notice POST refuses (finding 2). `/api/desk/state` failing: `createDeskGuard.open()` catches and answers `true` (fail closed), so an offline parent tab is hidden and sent to `/tutor`, which redirects to `/account` (no loop; `desk-guard.ts:32-38`, `tutor/page.tsx:45`).
- Race / duplicate risks: two tabs opening the desk: last cookie wins, same value. No server state means no race; `leave` and `forgot-pin` at once both delete a cookie.
- What the user sees: child: `/tutor`. Parent on an account page with a lock: redirect to `/tutor` (page) or `423 {error:'desk_open'}` (API) (`proxy.ts:58-60`). Restored page: blank until checked (`HIDE_ON_BACK`, `desk-guard.ts:19`). Wrong message: notice POST dead end.
- Existing tests: `src/lib/desk.test.ts` (26; `deskGate` path matrix at lines 243-249), `src/lib/desk-guard.test.ts` (8), `src/app/api/desk/open/route.test.ts` (5), `src/app/api/desk/forgot-pin/route.test.ts` (4), `src/proxy-child-details.test.ts` (3), `src/proxy-feedback.test.ts` (2).
- Pure core already? Yes for the rule and the guard: `src/lib/desk.ts` (no Next/DB/clock) and `src/lib/desk-guard.ts` (deps passed in). The route-level copies are not behind one function or one test.
- Value x risk: UX medium (a child leaving the desk, or a parent trapped). DX high (about 12 files). AX high: the rule is already one function, so the win is one "desk lock" module every route calls. Risk: medium (child-safety lock; no money).

### 2. Proxy request gate (deletion state x desk gate x scan route)
- Entity / storage: `src/proxy.ts` only; reads RPC `my_family_deletion_state`, then `family_deletions` with the secret key, the desk cookie and the Supabase claims.
- States: deletion `none | queued | unknown` (`proxy.ts:69-90`); session `known | unreadable | signed out`; gate `pass | to-desk | refuse`; the `hiddenScan` override (`proxy.ts:50-52`). Outputs: pass with `Cache-Control: private, no-store` on `/account` and `/admin`; redirect `/family-deleted`; JSON `410 family_deleted`; `503` page or JSON; redirect `/tutor`; JSON `423 desk_open`.
- Transitions (decision order): (1) path under `/api/account`, `/api/desk`, `/account`, `/tutor` and a signed-in parent and deletion `queued` -> 410 or redirect; `unknown` -> 503; (2) `deskGate` -> pass / to-desk / refuse; (3) a scan route with the gate closed passes when the family has no scan access, so the scan route shows its own not-found.
- Where rules live: `proxy.ts`, `src/lib/desk.ts`, `src/lib/family-delete.ts:47-55` (`familyPath`, `FAMILY_DELETED_STATUS`), `src/lib/scan-pages-access`. The family-deletion machine belongs to another area.
- DB enforcement: n/a (reads).
- Impossible / unhandled: the deletion read is skipped for paths outside `familyPath` (e.g. `/admin`, `/start`), so those are not blocked for a queued family (intent unverified). An Auth error (not a signed-out visitor) keeps an open desk closed (`proxy.ts:46`).
- Race / duplicate: one extra read per signed-in request on those paths; no writes.
- What the user sees: 410 JSON, `/family-deleted`, or 503 "Please try again in a moment" (`proxy.ts:99-103`).
- Existing tests: `src/proxy-family-delete.test.ts` (4), `src/proxy-child-details.test.ts` (3), `src/proxy-feedback.test.ts` (2), `src/proxy-scan-release.test.ts` (count not obtained).
- Pure core already? Partly: `deskGate` and `familyPath` are pure; the decision order is inline in `proxy()`.
- Value x risk: UX medium (a wrong 503/410 on a read blip), DX medium. Risk high (blocks a family under deletion; touches every account request).

### 3. Desk page view (no-workbook / awaiting-delivery / ready / failed)
- Entity / storage: derived. `deskView()` returns `{status:'no-workbook'} | {status:'awaiting-delivery'} | {status:'ready', ...}` (`src/lib/desk.ts:85-100`, `130-161`). The page adds a fourth state `null` (the load threw, `tutor/page.tsx:54-57`).
- States: `no-workbook` (no shipped book for the child, or the book has no pages); `awaiting-delivery` (no confirmed delivery receipt, checked twice around the package read, `desk.ts:140-149`); `ready` (with `notice: 'not-this-child' | null`); `null`.
- Transitions: every request recomputes from the workbook store and the delivery receipt. Event sources: workbook ship, delivery confirmation or retraction (other area).
- Where rules live: `desk.ts` (status), `tutor/page.tsx:67-78` (the three problem sentences), `src/lib/workbook-delivery-access.ts` (receipt rule).
- DB enforcement: RLS through the parent's session; the module re-checks parent, child, status `shipped` and the receipt (`desk.ts:136`).
- Impossible / unhandled: a shipped book with zero pages (or a missing book) returns `no-workbook` (`desk.ts:150`), and the page then says "There is no workbook here yet. When ... workbook arrives, its pages show here." (`tutor/page.tsx:75`): a wrong message. A retraction between the two receipt reads is handled (`desk.ts:149`).
- Race: retraction during the read: the second check handles it.
- What the user sees: the `tutor/page.tsx:75` sentences; ready: the page image and tap areas.
- Existing tests: `src/lib/desk.test.ts`, `src/app/(product)/tutor/page.test.ts`.
- Pure core already? Yes (`deskView` over a store seam; in-memory store in tests).
- Value x risk: low; already clean.

### 4. Parent PIN: leave check (attempt counter and lock)
- Entity / storage: `public.parent_pins` (`supabase/migrations/20261029_add_parent_pins.sql`): `parent_id` PK, `pin_hash`, `failed_attempts`, `locked_until`; RLS on, no grants to `anon`/`authenticated`; `fence_family_write` trigger.
- States (derived from two columns): no row = no PIN; `0/null` = open; `1..4` tries used; `locked_until > now` = locked; `locked_until <= now` = lock ended but not yet reset (the next claim resets it). Memory twin: `src/lib/parent-pin-memory.ts:44-57`.
- Transitions: `claim` (every check, before the hash compare; one SQL function under `for update`, `claim_pin_attempt`): none -> `none`; locked -> `locked`; else `failed_attempts += 1`, and `>= 5` sets `locked_until = p_now + 900 s`; returns `open` with the hash. A right PIN calls `clear` (reset to 0/null, only `where pin_hash = <checked hash>`, `parent-pin-store.ts:43-48`). Caller: `POST /api/desk/leave` -> `checkParentPin` -> `parentPins.check` (`parent-pin-server.ts:17-25`, `parent-pin.ts:110-130`).
- Where rules live: `PIN_POLICY` (`parent-pin.ts:10`), the SQL function, the memory store, the store. Status strings `none|locked|open` compared in 3 places (`parent-pin-store.ts:36-41`, `parent-pin.ts:114-115`, SQL).
- DB enforcement: PK uniqueness; atomic claim under the row lock; `check (length(pin_hash) between 20 and 300)`, `failed_attempts >= 0`. No check that `locked_until` and `failed_attempts` agree.
- Impossible / unhandled: `failed_attempts = 5` with `locked_until` in the past (reset only on the next claim; no screen reads the raw columns, `rg locked_until src` shows only the store and family-delete). The 5th try being right: the claim sets the lock, then `clear` removes it; if `clear` throws, the route answers `unavailable` and the parent stays locked despite a right PIN (`parent-pin.ts:118`, `parent-pin-server.ts:22`).
- Race / duplicate: concurrent guesses cannot all pass the limit (counted under the row lock). Child and parent share one counter (finding 7). Lock time uses the app clock (`parent-pin-store.ts:33`).
- What the user sees: Leave dialog: wrong -> "That is not the PIN. N tries left."; locked -> "Too many wrong tries. Try again after <time>"; not set -> link to Forgot PIN; signed out; default "We cannot check the PIN right now" (`src/components/desk.tsx:349-364`). Retry time text from `familyRetryTime` (`leave/route.ts:23`).
- Existing tests: `src/lib/parent-pin.test.ts` (41, concurrent claims included, in-memory store).
- Pure core already? Yes: `src/lib/parent-pin.ts` with a `PinStore` seam and `parent-pin-memory.ts`. The SQL is the second copy of the claim rule.
- Value x risk: UX low-medium (a child locks the parent out), DX medium (rule in SQL and a memory twin). Risk medium (access control for the child lock).

### 5. Parent PIN: Forgot PIN reset counter, and set/change
- Entity / storage: same row, extra columns `reset_failed_attempts`, `reset_locked_until`; SQL `claim_pin_reset_attempt` (`supabase/migrations/20261030_pin_reset_attempts.sql`), a copy of the PIN claim with its own columns and no hash.
- States: PIN set / not set; reset counter open / locked (same encoding as machine 4). Set path: `create` (first PIN, insert, 23505 = exists) vs `replace` (only while the stored hash is the verified one).
- Transitions: `forgot`: validate -> `claimReset` -> prove the account password (`passwordProver`, `desk-server.ts:34-45`) -> `reset` (upsert with a fresh PIN counter and a fresh reset counter) -> the route closes the desk. `set`: first PIN `create`; else needs `current`, which counts one PIN attempt, then `replace` resets the counter. Callers: `POST /api/desk/forgot-pin`, `POST /api/account/pin` (`savePin`, `parent-pin-server.ts:35`); the latter is refused with 423 while the desk is open (`desk.test.ts:249`).
- Where rules live: `parent-pin.ts:131-160`, both SQL claim functions, `parent-pin-memory.ts`.
- DB enforcement: PK; `reset` is one upsert; `replace` is a conditional update.
- Impossible / unhandled: `unavailable` from the password check (Supabase 429) has already used a try (the claim comes before `prove`, `parent-pin.ts:149-153`), so a Supabase rate limit can burn the parent's 5 tries (intent unverified).
- Race / duplicate: two forgot requests at once: each claims under the row lock; the last upsert wins. Set vs forgot: last write wins.
- What the user sees: `src/components/desk.tsx:415-433` ("That password is not right. N tries left", the locked time, "Save the PIN and leave the desk"); account PIN page `account/(dashboard)/pin/page.tsx`.
- Existing tests: `parent-pin.test.ts` (forgot and concurrent cases), `forgot-pin/route.test.ts` (4).
- Pure core already? Yes (`parent-pin.ts`).
- Value x risk: as machine 4. Three near-identical attempt-counter machines exist: PIN, PIN reset, family delete code (`claim_family_delete_attempt`, `src/lib/family-delete-server.ts:32`; other area).

### 6. Maya notice acceptance
- Entity / storage: `public.maya_notice_acceptances` (PK parent + version; first row stays; no update/delete grant; `20261105_add_maya_notice_acceptances.sql`). `MAYA_NOTICE_VERSION = "2026-11-05"` (`src/lib/maya-notice.ts:13`).
- States: per (parent, version): not agreed / agreed. A version bump re-asks everyone.
- Transitions: not agreed -> agreed: `POST /api/account/maya-notice` (`accept(parent, parent, seen)`; `seen !== version` returns `old_version` and saves nothing, `maya-notice.ts:56-60`). "Later": `maya=later` opens the desk without agreement (`desk/open/route.ts:39`). No revoke exists.
- Where rules live: `maya-notice.ts` (`callNeedsNotice(kind) = kind !== 'admin_test'`, `noticeDue`), `maya-notice-server.ts`, `maya-chat-server.ts:194` (refuse a new chat), `maya-voice-token.ts:34` (refuse a token), `desk/open/route.ts:39` and `tutor/page.tsx:64` (choose the screen). 5 files.
- DB enforcement: PK uniqueness only; the server decides refusal.
- Impossible / unhandled: a started chat continues after a version bump (only `start` checks it: "A chat already under way can still be read, answered and ended", `maya-chat-server.ts:193`). The desk shows `notice_required` as the generic error (finding 3). `noticeDue` returns false on a read error (shows no notice, the server still refuses the chat, `maya-notice.ts:71-77`).
- Race: duplicate accept: the insert ignores 23505.
- What the user sees: desk line "Ask a grown-up to turn on Maya from their account" (`maya-notice.ts:16`); `/account/maya-notice` page with `saved`/`changed`/`error` query flags.
- Existing tests: `maya-notice.test.ts` (13), `maya-notice-server.test.ts` (4), `maya-chat-notice.test.ts` (3), `api/account/maya-notice/route.test.ts`.
- Pure core already? Yes (store seam; memory store `maya-notice-memory.ts`).
- Value x risk: UX low (finding 3 and 2), DX low; risk medium (consent).

### 7. Maya chat access gate
- Entity / storage: derived from `public.test_accounts`, `public.maya_chat_families` (listed, rehearsal), `child_plan_states` via `familyOpenPlanChildren`, a Stripe subscription read, env `MAYA_CHAT_ENABLED`, and the child's grade.
- States: `chatFamilyGate(...)` returns `test | open_plan | plan | closed` (`src/lib/maya-chat.ts:61-66`); then `chatGate` returns `open | too_young | closed` (`maya-chat-server.ts:101-104`); a `plan` family also needs a running Stripe subscription (`trialing|active`, `familyRunningPlan`, `maya-chat-server.ts:51-71`).
- Transitions: a pure function of inputs; no stored state. Checked on every chat request (`desk-chat-request.ts:28`), the desk page and Parent home.
- Where rules live: `maya-chat.ts` (pure), `maya-chat-server.ts` (I/O), `plan-access.ts`. `MAYA_CHAT_ENABLED` is read only in `maya-chat.ts:63-65`.
- DB enforcement: none beyond table reads.
- Impossible / unhandled: Stripe unreadable -> throws -> the chat route answers 503 (`chat/route.ts:25`). A listed family with the switch off is closed. A child on an open plan never reads Stripe (by design).
- Race: n/a (reads).
- What the user sees: the chat card, or the "Grade 3 and up" note (`maya-chat.ts:53`).
- Existing tests: `maya-chat-access.test.ts` (20), `maya-chat.test.ts` (23), `maya-chat-rehearsal.test.ts` (3).
- Pure core already? Yes for the first level (`chatFamilyGate`); no for the Stripe level (inline in `familyRunningPlan`).
- Value x risk: UX medium, DX medium, risk medium (plan access, money-adjacent).

### 8. Maya call record (live / ended)
- Entity / storage: `public.maya_calls` (`20261031_add_maya_calls.sql` and later). Columns: `status` ('live'|'ended'), `kind` ('admin_test'|'chat'), `mode` ('text'|'voice'), generated `channel`, `revision`, `started_at`, `ended_at`, `live` jsonb, `trace` jsonb, `board_history`, `child_ink`, `child_ink_at`, `outcome_reason` (7 values), `assistance` (5), `paper_status` (3), `understanding` (2), `flag`/`flagged_at`, `safety_flag`/`safety_severity`, `learning_event_id`, `profile_rebuilt_at`, `note_pending`, `connected_seconds`, `counts_minutes`, `speech_to_text`, `voice`. TS `CallRecord` (`src/lib/maya-call.ts:156-205`).
- States (as encoded): `live`: `status='live'` and `live` not null (check `maya_calls_live_state`). `ended`, steps pending: `live` not null until the event is written (check `maya_calls_live_until_event`), or `note_pending` not null (check `maya_calls_note_pending`, ended only), or `learning_event_id` set and `profile_rebuilt_at` null. `ended`, complete. `ended`, legitimately event-less (never started or cancelled): `learning_event_id` null, `live` null. Voice call not started: `status='live'`, `started_at` null, `mode='voice'`.
- Transitions:
  - create: `start` / `startVoice` -> row `live`, revision 0 (`maya-call.ts:982-1040`). Triggers: admin `POST /api/admin/maya/workbook|voice`, desk `POST /api/desk/chat` (`runChat start`, `maya-chat-server.ts:209`).
  - live -> live: each `input` (child / tick / writing) saves at `revision+1` only if the stored revision equals the one read (`maya-call-store.ts:143-152`); a second writer gets `conflict`.
  - live -> ended: `end()` (`maya-call.ts:942-969`): session ended, child `end`, spend cap (`closeAtCap`), clock (`closeAtClock`), the sweep (`input end`), a voice worker. Writes `status:'ended'`, trace, outcome, `notePending`, flag; keeps `live` for the event.
  - ended -> ended (steps): `input end` on an ended call, or the sweep, re-runs `afterEnd` (machine 9).
  - Revision also raised outside `update`: SQL `claim_maya_chat_message` / `recover_maya_chat_message` (machine 13) and `append_maya_call_connection` (voice, machine 16). `append_maya_call_ink` does not raise it.
- Where rules live: `maya-call.ts` (1464 lines, one module); `maya-call-store.ts` (Supabase) and `maya-call-memory.ts` (twin, with its own copy of the live/ended checks, lines 36-47); SQL checks. Non-test files that compare `status` 'live'/'ended' (rg): 15: `api/admin/maya/calls/[id]/route.ts`, `components/admin-maya.tsx`, `maya-call-memory.ts`, `maya-call-note-memory.ts`, `maya-call-review-fixture.ts`, `maya-call-store.ts`, `maya-call-sweep.ts`, `maya-call.ts`, `maya-chat-server.ts`, `maya-chat.ts`, `maya-gate/call.ts`, `maya-gate/gate.ts`, `maya-voice-token.ts`, `maya-voice.ts`, `maya-weekly-email-store.ts`. SQL files that read `status = 'live'|'ended'`: 19 migrations.
- DB enforcement: checks on kind, mode, status, outcome enums, `maya_chat_workbook` (chat -> text, workbook, no minutes), `status='live' or (ended_at, outcome_reason, trace not null)`, `flag`/`flagged_at` paired, `kind='admin_test' -> counts_minutes=false`; trigger `maya_call_test_family` (admin_test only for a test family; kind/parent/child fixed). Not enforced: transition direction, `ended_at` null on a live call, `outcome_reason` agreeing with `trace.outcome` (the TS reads the outcome from `trace`, `maya-call-store.ts:93`, ignoring the columns), a monotonic `flag`.
- Impossible / unhandled: a live row with `ended_at` or `trace` set is allowed by the DB. `CallKind` TS has 2 values while 8 migrations name `'family'` (finding 4). A chat whose `startedAt` stayed null ends event-less (finding 1).
- Race / duplicate: revision compare-and-set (`maya-call-store.ts:143`); a conflict test exists in `maya-call.test.ts` (case name unverified). Double start with the same id: PK conflict -> throws -> 503 (`runChat`; the desk avoids it with `startId` and `requestBusy`).
- What the user sees: child (chat): `ChatView.ended`, transcript, "Chat again" (`desk-chat.tsx:420-422`). Admin: `Live` chip or outcome chip (`admin-maya.tsx:205`); the call page "What was saved". Wrong message: finding 1.
- Existing tests: `maya-call.test.ts` (13), `maya-call-safety.test.ts` (9), `maya-call-list.test.ts` (7), `maya-call-store-sweep.test.ts` (3), `maya-voice-call.test.ts` (16), `maya-chat.test.ts` (23), `maya-spend-call.test.ts` (25). Memory store `maya-call-memory.ts`.
- Pure core already? Yes: `mayaCalls(seams)` (`maya-call.ts:689`) has no DB/Next import; seams for store, history, events, rebuild, model, alerts, note, clock. But the lifecycle is one 1464-line closure with status strings inline; there is no transition table.
- Value x risk: UX high-medium (stuck live chats, lying admin chips). DX high (status rules in 2 stores, SQL, UI). AX medium: header comments are good but stale (finding 4). Risk high (children's live calls). PRs #698 and #677 touch `src/lib/maya/`, not this file (not verified for #698).

### 9. Call end pipeline (learning event, profile rebuild, parent note, `live` retention)
- Entity / storage: same row: `live`, `learning_event_id`, `profile_rebuilt_at`, `note_pending`; the `learning_events` row with key `call:<id>`.
- States (ordered): E0 ended, event not written (`live` not null, `learning_event_id` null) -> E1 event written (`learning_event_id` set, `live` null) or event-less (`learning_event_id` null, `live` null) -> E2 profile rebuilt (`profile_rebuilt_at` set) -> E3 note done (`note_pending` null). Four nullable columns, no single state value.
- Transitions: all in `afterEnd` (`maya-call.ts:857-896`): `recordHeard` (wording history, idempotent) -> `events.append` (`key_conflict` counts as written; a refused event is logged and treated as done with no id) -> `store.update(live:null, learningEventId)` -> `rebuild` -> `store.update(profileRebuiltAt)` -> `notes()`. Triggers: the request that ended the call; then `input end` on the ended call (child, or admin "Try saving again"); then the sweep (machine 12). Each store write is a revision compare-and-set; a lost compare returns early without the later steps.
- Where rules live: `afterEnd`, `notes`, `end` in `maya-call.ts:857-969`; the sweep's `unfinished()`; the admin screen condition `!learningEventId || !profileRebuiltAt` (`admin-maya.tsx:564`); SQL checks.
- DB enforcement: `maya_calls_live_until_event`; `maya_calls_note_pending`. Not enforced: `profile_rebuilt_at` only with an event id.
- Impossible / unhandled: an event-less ended call has `profile_rebuilt_at` null for ever and is not "unfinished" (needs `learning_event_id` not null); the admin screen reads it as unfinished (finding 1).
- Race / duplicate: two ends: one passes the revision compare. A retry re-runs `recordHeard` (idempotent by design). The event key `call:<id>` is unique; a duplicate append is `key_conflict`, handled.
- What the user sees: nothing for a child; admin "Saved to child's record" / "Child's profile updated" (`admin-maya.tsx:559-560`).
- Existing tests: `maya-call.test.ts`, `maya-call-sweep.test.ts` (22), `maya-call-note.test.ts` (42).
- Pure core already? Yes, inside `mayaCalls`.
- Value x risk: as machine 8; the four-column order is an implicit sequence that would benefit from a named state.

### 10. Parent note (`maya_calls.note_pending` + `public.maya_call_notes`)
- Entity / storage: `note_pending` jsonb on the call (the package and event as code built them); `public.maya_call_notes` (PK `call_id`; `writer` 'ai'|'code'; check `(writer='ai') = (warm is not null)`; trigger `maya_call_note_family_call` refuses non-family kinds, non-ended calls, mismatched family, and test families except the rehearsal family; migrations `20261101_add_maya_call_notes`, `20261102171510`, `20261105073754`, `20261105081527`).
- States: no note and `note_pending` set (waiting); note stored and `note_pending` set (written, not cleared); note stored and cleared (done); refused for good (test call / test family) and cleared (done); `no_name` / `not_ended` stays pending. TS `NoteStep = 'done' | 'pending'` (`maya-call-note.ts:510-517`).
- Transitions: `write()` once: kind check -> test-family check -> already stored? (`created:false`) -> the child's name must exist -> optional AI warm sentence from a bank -> insert (`exists` handled) (`maya-call-note.ts:529-570`). `done` -> `clearNote` (`update ... where status='ended' and note_pending is not null`, `maya-call-store.ts:180-191`). Run by the call's own end (bounded by `NOTE_STEP_MS` 20 s), by the next call's end (up to `NOTE_SWEEP` 3 earlier pending calls of the child), and by the sweep for 24 h after the end.
- Where rules live: `maya-call-note.ts`, `maya-call.ts:898-940` (`notes`), `maya-call-sweep.ts`, the SQL trigger, `maya-weekly-email-store.ts` (the recap reads `note_pending`).
- DB enforcement: unique `call_id`; the trigger. Not enforced: `note_pending` cleared only after a note exists.
- Impossible / unhandled: a child with an empty `first_name` stays `no_name`; the sweep only retries for `RETRY_WINDOW_MS` (24 h) after the end, so the call keeps `note_pending` for ever and the weekly recap may wait for it (recap rule not read in detail: unverified). A note written after the note step timed out is found on the next try and then cleared (the `late` flag skips the clear, `maya-call.ts:906-913`).
- Race: concurrent writers: PK conflict is `exists`; `clearNote` is idempotent.
- What the user sees: the parent notes list (`account/(dashboard)/notes`; not read in detail).
- Existing tests: `maya-call-note.test.ts` (42), `maya-call-note-store.test.ts`.
- Pure core already? Yes (`callNotes(seams)`).
- Value x risk: UX low-medium, DX medium; risk low-medium (parent-facing text, code-only by default).

### 11. Call flag and alert ledger
- Entity / storage: `maya_calls.flag` ('unsafe_request' < 'safety_concern' < 'safety_immediate') + `flagged_at` (check paired, `20261101_add_maya_call_flags.sql`); `public.maya_call_alerts` (unique `(call_id, level)`; `status` 'sending'|'sent'|'refused'|'unknown'; check `sent -> email_id`).
- States: flag: none -> unsafe_request -> safety_concern -> safety_immediate (only up, TS rule). Alert per (call, level): `sending` -> `sent` | `refused` | `unknown`; `refused` -> `sending` again (re-claim); a stale `sending` (> 10 min) is shown as `unknown` by TS only.
- Transitions: flag raised in the same write that saves an input or ends the call (`flagOf`, `risen`, `maya-call.ts:628-651`; `save`, `end`). Alert: `callAlerts.send` -> `sendEmailOnce(ledger, key, ...)` (`maya-call-alert.ts:79-94`); the store `claim` inserts, or on 23505 re-claims only `status='refused'` (`maya-call-alert-store.ts:41-60`); outcomes `sent/refused/unknown` are written under `claimed_at` (line 30-38). Re-sent on each later input or `end` of a flagged call.
- Where rules live: `maya-call.ts:628-660, 807-815`, `maya-call-alert.ts`, `maya-call-alert-store.ts`, `maya-call-alert-memory.ts`, `maya-flag-text.ts`, `admin-maya.tsx:503-530`, `maya-call-server.ts:181-186`. Flag level strings in 7 non-test files (`maya-call-alert.ts`, `maya-call-review-fixture.ts`, `maya-call-server.ts`, `maya-call.ts`, `maya-flag-text.ts`, `maya-gate/behaviours.ts`, `maya-gate/gate.ts`). Alert `sending` string in `admin-maya.tsx`, `maya-call.ts`, `maya-call-alert-store.ts`, `maya-call-alert-memory.ts`.
- DB enforcement: enum checks, unique key, paired columns. Not enforced: monotonic flag; `flag` vs `safety_flag`/`safety_severity` agreeing (dual encoding, finding 6).
- Impossible / unhandled: the stale `sending` row never changes in the DB; the migration comment contradicts the store. The retry button shows only for `refused` or no alert (`admin-maya.tsx:509`), not for stale `sending`/`unknown` (by design: "check the inbox").
- Race / duplicate: two runs claim: the unique key decides; a late outcome write from a run whose claim was taken over matches no row (`.eq("claimed_at", ...)`, line 32). Safety first: the alert goes before the learning event (`end`, `maya-call.ts:967-968`).
- What the user sees: the admin flag strip (`admin-maya.tsx:503-530`); parents nothing; the team gets an email without the child's words.
- Existing tests: `maya-call-safety.test.ts` (9), `maya-call-alert-store.test.ts` (2).
- Pure core already? Yes for the alert (`callAlerts` over a ledger seam).
- Value x risk: UX high for the team (a missed safety email), DX medium, risk high (child safety, email sending).

### 12. Abandoned-call sweep and its cursors
- Entity / storage: no new call state; reads `maya_calls` through the partial indexes `maya_calls_live_idx` and `maya_calls_unfinished_idx`; keeps its place in `public.maya_call_sweep_cursors` (`kind` 'live'|'unfinished' PK; `at`, `call_id`, `until_at`; checks `(at is null) = (call_id is null)` and `(at is null) = (until_at is null)`; `20261105_maya_call_sweep_cursors.sql`, `..._cursor_until.sql`).
- States: a live call is `due` when `abandonedAt(record) <= now` (its own end time + 5 min; a started voice call also waits `VOICE_CALL_STALE_MS`, `maya-call-sweep.ts:116-121`). An ended call is `due` when `unfinished()`, ended within 24 h (`RETRY_WINDOW_MS`) and last written 5 min ago. Cursor: null (at the oldest) or `{after, until}` (a pass in progress).
- Transitions: per run (the `/api/reminders` cron every 15 min, `src/app/api/reminders/route.ts:69,85`): read the place -> page through due calls -> store the call as the place before ending it -> `calls.input(id, revision, {type:'end'})` -> result `ended | retried | conflict | failed | left | cut`. A pass ends when it reaches a call newer than `until` or runs out; the place returns to null.
- Where rules live: `maya-call-sweep.ts` (pure), `maya-call-store.ts:205-245` (`UNFINISHED`, `sweepCallSource`), the partial indexes, `maya-call-sweep-server.ts`, `maya-call.ts` (`input end`). The sweep is run only from the reminders cron (`rg sweepAbandonedCallsNow`).
- DB enforcement: cursor checks only. Cursor rows have no lock; two overlapping runs read the same place and the last write wins; call ends are guarded by the call revision.
- Impossible / unhandled: a live call that always fails to end is retried every pass for ever; an unfinished call only for 24 h. `abandonedAt` with `live` null would use limit 0 (unreachable for a live row).
- Race / duplicate: sweep vs the child's last request: the loser gets `conflict` and changes nothing (`maya-call-sweep.ts:196-197`). Two sweeps: same.
- What the user sees: the desk shows an abandoned chat as ended with "Chat again" (`maya-call-sweep.ts:17-18`); the admin list shows ended / time_limit.
- Existing tests: `maya-call-sweep.test.ts` (22), `maya-call-store-sweep.test.ts` (3).
- Pure core already? Yes (`sweepAbandonedCalls` over a `SweepCallSource` seam, memory store).
- Value x risk: UX medium (stuck live calls), DX high (three definitions of "unfinished", finding 5). Risk medium (runs in the shared reminder cron).

### 13. Chat message admission and lease (`maya_chat_messages`)
- Entity / storage: `public.maya_chat_messages` (PK `id`; `unique (call_id, input_revision)`; `claim_revision`, `lease_until`, `received_at`, `fingerprint`, `body`; `20261102171510_desk_maya_chat.sql`, `20261102172535_desk_maya_chat_recovery.sql`). No status column.
- States (derived from the row, the call and the clock): in flight = `claim_revision = call.revision`, `lease_until > now`, call live; lease expired = same with `lease_until <= now` (recoverable); done = `call.revision > claim_revision`; row of an ended call (ignored by the queries). SQL answer codes: `accepted | busy | done | conflict | recover | window | cap | not_found | invalid | missing_body | none`.
- Transitions: `take_maya_chat_message` -> `claim_maya_chat_message` (latest body in `20261105_maya_call_ink_log_lock_order.sql:63-98`): locks parent (share), child, call; a replay of the same `id` with another fingerprint/revision = `conflict`; `call.revision > claim_revision` = `done`; lease live = `busy`; else re-claim (bumps the call revision, new 2-minute lease) = `accepted`. A new id: revision/status check, another child message in flight = `busy` or `recover`, day-window check (22-26 h), cap 60 a day, then insert + bump. `recover_maya_chat_message` re-leases an expired in-flight message and returns its `body` so the server replays it (`runChat recoverChild`, `maya-chat-server.ts:167-178`). Trigger: `POST /api/desk/chat` actions start/read/child/end.
- Where rules live: the SQL functions (`claim_maya_chat_message` is redefined in 3 migrations; the latest wins), `maya-chat-server.ts:157-245`, `maya-chat.ts` (cap 60, windows), the desk client `pending`/`uncertain` flags (machine 15).
- DB enforcement: unique `(call_id, input_revision)`; row locks in a fixed order (parent, child, call) to avoid deadlock; the day cap and the window are inside the function.
- Impossible / unhandled: `missing_body` (a row from before the recovery migration) sets `childPending = true` until the sweep ends the call (`maya-chat-server.ts:170-172`; legacy rows only, unverified). A message the model keeps failing on leaves a lease that expires and is replayed by every `read`, each replay running the model again; bounded only by the spend and day caps (unverified bound). Rows count toward the 60-a-day cap even when the model never answered (`count(*)` over `received_at`).
- Race / duplicate: designed for it: the same message id retried returns `done` or `busy`; two messages at once: the second is `busy`.
- What the user sees: input disabled while `chat.pending` (`desk-chat.tsx:424-426`); polling every 3-30 s while pending (`desk-chat.tsx:357-371`); the error text is generic (finding 3).
- Existing tests: `maya-chat.test.ts` (23), `desk-chat.test.ts` (35). The SQL has no test that I found (unverified); `maya-call-ink-locks.test.ts` (2) checks lock-order text.
- Pure core already? No: the state is in SQL plus `runChat`. It could be a pure function of (row, call, clock).
- Value x risk: UX high (a stuck or lost child message), DX high (derived state across 3 places). Risk high (live child conversations, paid model calls).

### 14. Chat ink log: server append and device outbox
- Entity / storage: server: `public.maya_call_ink_events` (PK `(call_id, seq)`, `seq` 1..20000, `event` jsonb < 200 KB; `20261105_maya_call_ink_log.sql`), `maya_calls.child_ink_at` (rate), legacy `maya_calls.child_ink` (copied into events on the first append). Device: `localStorage` key `unica-chat-ink:<chat id>` = `{acked, events, child}` (`desk-chat.tsx:32`, `keep`, lines 143-147), plus the board draft `unica-board:chat:<id>` (`board-history.ts:759`).
- States: server answer `saved | busy | closed | gap | not_found` (+ `not_this_desk` in TS, `invalid_input`). Device, per chat: `acked` vs `log.length`; each request result `sent | again | final | busy | retry` (`desk-chat.tsx:46`).
- Transitions: server `append_maya_call_ink` (latest `20261105_maya_call_ink_log_lock_order.sql:15-60`): not found -> `closed` if ended > 5 min -> convert the legacy copy -> `busy` if the last append < 1 s -> `gap` if `from > held+1` -> insert missing sequences with `on conflict do nothing` -> `saved`. Route `POST /api/desk/chat/board` maps to 200/404/403/409/410/429. Device: save 1.5 s after a change; `flush` loops parts of <= 200 events / 250 KB; 410 or the route's own 404 = `final` (drop the outbox); 409 = send again from `held`; 429 = wait (5 tries); other = `retry` (keep). `finish` tries 3 times (1 s, 2 s) before the chat ends; the chat ends anyway. On `pagehide` it flushes this visit's chats with keepalive. A sibling's outbox is never read.
- Where rules live: `maya-call.ts:288-318,1432-1450`, `maya-call-store.ts:166-178`, the SQL function, `app/api/desk/chat/board/route.ts`, `desk-chat.tsx:32-258`. Constants in 3 places: `INK_SAVE_GAP_MS` 1000 (TS and `p_gap_ms`), `PART_GAP_MS` 1100 (client), `INK_AFTER_END_MS` 5 min (TS and SQL param).
- DB enforcement: PK, seq range, event size, `on conflict do nothing`, row lock.
- Impossible / unhandled: an outbox for a chat that ended > 5 min ago is dropped as `final` even though the call never held all of it (by design, `desk-chat.tsx:121-123`). A chat that ended while the device was offline loses its last ink after 5 minutes.
- Race / duplicate: designed: a sequence is stored once. Two tabs of one chat share the device key (last `keep` wins; the board tab lock keeps one writer, machine 21).
- What the user sees: nothing directly; the admin replay shows the child's ink.
- Existing tests: `desk-chat.test.ts` (35), `maya-chat.test.ts`, `board-history.test.ts` (46, ink log functions), `maya-call-ink-locks.test.ts` (2).
- Pure core already? Yes for the log rules (`inkLog`, `growInkLog`, `historyFromLog`, `startingChatBoard` in `board-history.ts`). No for the sender: `useInkSaver` is a ~230-line React hook with refs for generation, queues, timers (`desk-chat.tsx:119-258`).
- Value x risk: UX medium (lost ink), DX high, AX high value if the sender were extracted like `board-session.ts`. Risk medium.

### 15. Desk chat client flow (`useDeskChat`)
- Entity / storage: React state and refs in `desk-chat.tsx:261-402`: `usage`, `chat`, `ownerKey`, `busy`, `error`, `uncertain`, `callInk` ('loading' | log); refs `startId`, `pending` (message in flight), `epoch`, `requestBusy`; `sessionStorage` key `unica-chat:<book>:<page>:<question>` holds the chat id (no child text).
- States (flag combinations): no chat; chat live; chat live + `chat.pending` (the server says a message is in flight); `uncertain` (a lost reply, the same message id is replayed); chat ended; usage `left = 0`; spend `week_used`/`paused`; error.
- Transitions: pick a question -> `read` if a chat id is stored; "Chat with Maya" -> `start` (new id when the last chat ended); send -> `child` with a fixed `messageId` kept in `pending` until `admission` is `refused` or no error; End chat -> `board.finish` then `end`; poll `read` (or the pending message) every 3-30 s while pending or uncertain; reload at `usage.resetsAt + 1 s`.
- Where rules live: `desk-chat.tsx` only; the server's `ChatReply.admission` (`maya-chat.ts:22`) is the contract.
- DB enforcement: n/a (client).
- Impossible / unhandled: `error` set while `uncertain` is true; `busy` and the `requestBusy` ref are two copies of one fact. `notice_required`, `window`, `conflict` show the same text (finding 3). The `epoch` counter drops late replies of an earlier question (`generation !== epoch.current`).
- Race / duplicate: `requestBusy` blocks double clicks; `pending.current` makes a retry idempotent with the server's message id.
- What the user sees: `desk-chat.tsx:405-430` (buttons disabled on `busy || uncertain || chat.pending || ...`).
- Existing tests: `src/components/desk-chat.test.ts` (35).
- Pure core already? No (a hook). About 8 pieces of state and refs.
- Value x risk: UX medium-high (a stuck "Sending" state), DX medium, risk medium (child-facing UI).

### 16. Voice call (record, worker handle, connections, token)
- Entity / storage: `maya_calls` with `mode='voice'`; `public.maya_call_connections` (append only; kind 'agent_joined'|'agent_left'|'child_joined'|'child_left'; trigger `maya_call_connection_voice`; function `append_maya_call_connection` raises the call's revision, `20261101_maya_connection_ownership.sql`). TS `VoiceCall` handle with `lost`, `replaced`, `ended`, `working` flags (`maya-call.ts:420-470`).
- States: record created, not started (`started_at` null, `live` set); started (worker joined); ended (worker, hang-up, `limit()`, spend cap, or admin once `VOICE_CALL_STALE_MS` after the start). Connected time = child present while the agent lease (15 s, renewed) holds (`connectedSeconds`, `maya-voice.ts:289-307`).
- Transitions: `startVoice` (admin routes) -> token (`mintVoiceToken`: voice, live, same family, notice agreed unless admin_test, `maya-voice-token.ts:30-34`) -> worker `openVoice` (mode voice, status live, `live` set, model available) -> inputs saved at each revision -> `end`. A save refused = `lost` + `replaced`; a thrown save = `lost` only.
- Where rules live: `maya-call.ts` (the handle, and the admin end rule in `input`, lines 1370-1388), `maya-voice.ts`, `maya-voice-token.ts`, `worker/maya-voice/src/*`.
- DB enforcement: a trigger limits connections to voice calls; revision compare-and-set in the SQL function. No check that connections belong to a live call.
- Impossible / unhandled: the admin end of a started call before `VOICE_CALL_STALE_MS` returns `voice_call`. Voice calls exist only as `admin_test` (`maya_chat_workbook` only forbids chat + voice; a family voice kind is not in the kind check). Real voice is "not open yet" (`maya-notice.ts:24`).
- Race: the worker's own queue serialises inputs; a second writer makes the handle `lost`.
- What the user sees: the admin call page only (`admin-maya.tsx`).
- Existing tests: `maya-voice.test.ts` (20), `maya-voice-call.test.ts` (16), `maya-voice-token.test.ts` (11), `maya-voice-ack.test.ts` (4); `worker/maya-voice/src/*.test.ts` (not read).
- Pure core already? Partly: `maya-voice.ts` is pure; the handle is inside `mayaCalls`.
- Value x risk: low UX today (admin only), medium DX, low risk until voice opens.

### 17. Maya minutes ledger
- Entity / storage: `public.maya_minute_grants` (`call_id` PK; `used_seconds` null while open, set on settle; checks `(used_seconds is null) = (settled_at is null)`, `kind` 'child'|'parent_demo'), `parents.time_zone`; functions `grant_maya_minutes`, `maya_minutes_used`, `_maya_minutes_used`, trigger `settle_maya_minutes` on `maya_calls` (`20261101_add_maya_minutes.sql`; later versions of the functions in `..._maya_minute_time_windows`, `20261102155713_current_maya_minute_window`, `20261102164821_maya_window_zones`: not read, the latest wins).
- States: no grant; open grant (counts the whole grant for 2 min with no call row, then while the call row exists and is unsettled); settled (counts `used_seconds`).
- Transitions: `grant` (before the call) -> the settle trigger when the call is `ended` (`used_seconds = min(granted, connected_seconds ?? call_seconds)`).
- Where rules live: `maya-minutes.ts`, SQL, `maya-minutes-store.ts`, `maya-minutes-server.ts`, `parent-view-server.ts:146`.
- DB enforcement: strong (advisory lock per child, checks).
- Impossible / unhandled: no production caller of `grantChild`/`grantDemo` (finding 8), so rows cannot exist; `counts_minutes` never written true.
- Race: advisory lock per child or parent.
- What the user sees: the Parent home usage line for test families (`maya-minutes-server.ts:19`).
- Existing tests: `maya-minutes.test.ts` (20), memory store `maya-minutes-memory.ts`.
- Pure core already? Yes. Dormant.
- Value x risk: low value now; revisit when voice opens. Low risk.

### 18. Maya spend reservations
- Entity / storage: `public.maya_spend` (`20261105_add_maya_spend.sql` and two follow-ups): `charge` 'child'|'global', `what` (6 values incl. 'profile'), `reserved_micros`, `cost_micros`, `uncertain`, `settled_at`; checks `(settled_at is null) = (cost_micros is null and not uncertain)` and `not (uncertain and cost is not null)`; `maya_spend_alerts` (one row per month).
- States: reserved (open; counts `reserved_micros` for 10 min, then 0); settled with a cost; settled uncertain (cost unknown, the reservation keeps counting). `SpendState`: `open | week_used | paused` (`maya-spend.ts:58`).
- Transitions: `reserve_maya_spend` (global advisory lock; refuses past the child's week cap) -> `settle_maya_spend(id, cost|null)` (first settle wins, `where settled_at is null`); the month alert is claimed once (`claim_maya_spend_alert`).
- Where rules live: `maya-spend.ts` (the 10-minute TTL is in TS and in SQL `_maya_spend_counted`, `20261105_maya_spend_no_monthly_stop.sql:20`), `maya-spend-store.ts`, `maya-spend-memory.ts`, `maya-call.ts` (`closeAtCap`, `spendState`), `maya-chat-server.ts:88-98`.
- DB enforcement: yes (checks, locks, first-settle). The TTL constant is duplicated in TS and SQL.
- Impossible / unhandled: ledger unreadable -> state `paused` (fail closed).
- Race: one global advisory lock serialises all reservations (a hot lock, unverified under load).
- What the user sees: child: week-used / paused line (`maya-chat.ts:15`); parent: the 80% notice; team: a monthly email.
- Existing tests: `maya-spend.test.ts` (16), `maya-spend-call.test.ts` (25), `maya-spend-review.test.ts`.
- Pure core already? Yes (ledger over a store seam).
- Value x risk: UX medium, DX low; risk high (money, the live cap).

### 19. Maya session controller (state machine; PRs #698 and #677 in flight, not judged)
- Entity / storage: JSON `Session` (version 4) inside `maya_calls.live.text.session` and `trace` (`src/lib/maya/session.ts:272-395`).
- States: main `READY, OPEN, ASSESS, MODEL_EXAMPLE, TRY_TARGET, GUIDE_TARGET, CHECK, WRITE_CLOSE, CLOSE, CONTENT_HOLD`; interrupts `SAFETY, CONFIRM_HEARD, WAIT_WRITE, REDIRECT, REPAIR_MAYA, TIME_CLOSE` (`MAIN_STATES`, `INTERRUPTS`, lines 85-89); `resume: Teaching | null` records where an interrupt returns. Beside `state`: `silence` ('none'|'check_due'|'checked'|'close_due'), `expect`, `stopRequested`, `opened`, `clarified`, `noStart`, `retried`, `writeAsked`, `offeredOtherInput`, `solved` ('child'|'maya'|null), `lastResult`, `outcome`, a `safety` object, and about 30 more fields. `Reason` has 7 values.
- Transitions: `step(session, event)` (`session.ts:808`) with events `start | child_turn | proposal | tick | writing | safety | maya_said | content_problem | ...`; priority SAFETY > stop / TIME_CLOSE > REPAIR_MAYA > CONFIRM_HEARD > teaching. About 23 `moveTo(`/`s.state =` sites (`rg -c`). Driven by `maya-text.ts` (text) and the voice worker.
- Where rules live: one file (2463 lines) plus `proposal.ts`, `lines.ts`, `phrases.ts`, `numbers.ts`, `fractions.ts`, `scope.ts`. State names are also compared in `maya-voice.ts:324` (`nextTickAt`), `maya-gate/gate.ts` and `maya-call.ts:1160`.
- DB enforcement: none (a jsonb blob). `version: 4` with many fields optional "a saved session from before has no field" (6 comments), so old live sessions are a second legacy shape.
- Impossible / unhandled: not judged (in flight). State plus several booleans can disagree (not verified).
- Race: one session per call, protected by the call revision.
- What the user sees: Maya's words and board; `CONTENT_HOLD` closes a call with no teaching.
- Existing tests: `maya/session.test.ts` (75) plus about 14 more `maya/*.test.ts`, `maya-gate/*` (40 scripted children, in `npm test`), `maya-practice`.
- Pure core already? Yes (`src/lib/maya/session.ts`, no React/DOM/network/clock).
- Value x risk: high value to document; risk high (children's teaching, two PRs in flight).

### 20. Board history (`src/lib/board-history.ts`, pen holder, drafts)
- Entity / storage: `BoardHistory = {v:1, revision, events[]}` in memory and as a draft in localStorage `unica-board:<book>:<page>:<q>` or `unica-board:chat:<id>`, stamped `<ms>@<json>`.
- States: pen holder `maya | child` (last `pen` event, default `maya`, `penHolder`, line 74); `penHasMoved`; full at `MAX_EVENTS` 4000 (`MAX_LOG` 8000 for pen/undo/clear). Event kinds: `maya`, `stroke`, `recovered`, `undo`, `clear`, `skipped`, `pen`; the ink log adds `delivered`.
- Transitions: `mayaWrites`, `takePen`, `givePen`, `mayaFinished`, `drawStroke`, `undo`, `clear`, `restoreKept` return `Change = {ok, history} | Refused` with codes `pen_with_maya | pen_with_child | invalid_stroke | nothing_to_undo | full | refused`. Draft: `saveDraft(store, key, h, base, now)` returns `saved | reload | failed`; `evict` keeps <= 30 drafts (60 hard); a board open in a tab (`markOpen`, 5 min) never goes.
- Where rules live: this one file (839 lines); the board protocol has its own pen (machine 23); `PenHolder` is exported from `board-protocol` and re-exported here.
- DB enforcement: n/a (client). The server keeps the ink log and the call's batches (machine 14).
- Impossible / unhandled: a draft that does not decode returns null and "the board starts again" (data loss by design); a stale `base` returns `reload`.
- Race: two tabs on one board: prevented by machine 21; `saveDraft` compares the stored copy with `base` (a compare-and-set in storage).
- What the user sees: the board, "You have the pen / Take the pen" (`our-board.tsx:535-554`).
- Existing tests: `board-history.test.ts` (46), `board-session.test.ts` (17), `board-tab.test.ts` (12).
- Pure core: yes, the model pattern. Value x risk: already extracted; low risk to leave.

### 21. Board tab (holder / reader / lease)
- Entity / storage: Web Lock `unica-board-lock:<key>` (browser) or a lease in localStorage `unica-board-lease:<lockname>` = `{tab}`; BroadcastChannel `unica-board` (or the storage event `unica-board-message`); a `closed` flag in the closure (`src/lib/board-tab.ts`, 219 lines).
- States: `TabRole = holder | reader` (`owns()`); `closed`; waiting for a hand-over (`waiting` callback).
- Transitions: open: `tryTake` up to `OPEN_TRIES` 4 x `OPEN_RETRY_MS` 150 -> holder or reader. Messages `ask | released | saved`. Reader `takeOver()`: post `ask`, wait for `released` or `HAND_OVER_MS` 3000, try the lock 5 x 100 ms, then `force` (only the lease lock has `force`; Web Locks do not) -> holder, or false. Holder on `ask`: `letGo()` (`beforeRelease`, release, reload draft, post `released`). `close()` releases. A tab whose lease was taken becomes a reader at the next `owns()` call.
- Where rules live: `board-tab.ts` only; consumer `our-board.tsx:279-310`.
- DB enforcement: n/a.
- Impossible / unhandled: with Web Locks (no `force`) a frozen, non-crashed holder cannot be taken over; `takeOver` returns false and the UI says `KEPT_NOTE` (`our-board.tsx:398-404`). The `opening` role in the session shows the holder pen UI with disabled buttons (`our-board.tsx:548`).
- Race: two tabs taking a lease at once: write, wait 80 ms, read back; the last writer wins.
- What the user sees: "Another tab has this board ... Use it here" (`our-board.tsx:535-541`).
- Existing tests: `board-tab.test.ts` (12) with `createMemoryLocks`, `createMemoryChannels`, `createFakeTimers`, `createMemoryDraftStore`.
- Pure core: yes (seams injected, no DOM).
- Value x risk: model pattern; low risk.

### 22. Board session (`endHolding`)
- Entity / storage: closure in `src/lib/board-session.ts` (450 lines): `history`, `role` ('opening'|'holder'|'reader'), `live` stroke, `kept` strokes, `saved`, `clock`.
- States: role `opening | holder | reader`; a stroke in progress or not; kept (unsaved) ink.
- Transitions: every way out of holding goes through `end(reason)` with reason `handover | forced | lost | pagehide | close`; it ends the stroke as a pointer-up, saves if still owner, else keeps the ink and says `moved` or `elsewhere` (`board-session.ts:240-270`). Others: `attach`, `tabChanged`, `penDown/Move/Up/Cancel`, `take`, `giveBack`, `undo`, `clear`, `mayaDone`, `mayaReply`, `handBack`. 7 `SessionNote` values.
- Where rules live: this file; the component only forwards events (`our-board.tsx`).
- DB enforcement: n/a.
- Impossible / unhandled: none found; "a stroke always ends up in exactly one place: stored, or kept" is stated and tested.
- Race: another tab forcing the board away is covered by the `forced`/`lost` paths.
- What the user sees: notes in `our-board.tsx` (`NOTES`).
- Existing tests: `board-session.test.ts` (17), driving a real `openBoardTab` on the memory seams.
- Pure core: yes. Model pattern.

### 23. Board batch protocol (sender / receiver)
- Entity / storage: `createBoardSender` / `createBoardReceiver` (`src/lib/board-protocol.ts`, 847 lines) over a `BoardTransport` seam (in-memory `board-protocol-memory.ts`; LiveKit RPC in production, #329). The epoch is kept in the page's session storage across a reload.
- States: batch `accepted | shown | presented | cancelled` (`BatchState`, line 48); receiver `epoch`, `revision`, `pen` ('maya'|'child'), `logLength`; response codes `invalid_request | refused | duplicate_batch | out_of_order | stale_revision | stale_epoch | pen_with_child | wrong_session | too_large | behind | conflict`.
- Transitions: requests `apply | stop | release | cancel | status | reset`; accepted -> shown on `release` -> presented when drawn; staged batches are cancelled when the child takes the pen or on `stop`. A connect starts a new epoch and rebuilds from the sender's log; a newer claim by another sender makes the older one fail.
- Where rules live: this file, `board-speech.ts`, `board.ts` (core). A second pen model lives here, beside machine 20's.
- DB enforcement: n/a; a voice call stores the log in `maya_calls.board_history.delivery`.
- Impossible / unhandled: not examined in depth (unverified beyond the header and types).
- Existing tests: `board-protocol.test.ts` (41), `board-cancellation.test.ts` (5).
- Pure core: yes.
- Value x risk: dormant with voice; medium risk to touch.

### 24. Admin chat family list and rehearsal family
- Entity / storage: `public.maya_chat_families` (PK `parent_id`; `rehearsal` boolean; a unique partial index allows at most one `rehearsal`; `20261105073754`, `20261105081527_maya_chat_rehearsal_guard.sql`, `20261105211718_maya_admin_lock_order.sql`).
- States: not listed / listed / listed + rehearsal (a test family that still gets parent notes and recaps).
- Transitions: `admin_set_maya_chat_family(parent, 'listed'|'rehearsal', enabled)` returns `ok | not_test_family | not_listed | taken` (`admin-maya-chat.ts:50-58`); the pure pre-check `rehearsalRefusal` is in `maya-chat.ts:72`.
- Where rules live: the SQL function (parent lock first), `maya-chat.ts`, `admin-maya-chat.ts`, the note trigger (rehearsal exception).
- DB enforcement: yes (unique rehearsal index, lock order, trigger).
- Existing tests: `admin-maya-chat.test.ts`, `maya-chat-rehearsal.test.ts` (3).
- Pure core: partly. Low risk.

### 25. Voice worker (dormant)
- `worker/maya-voice/src/*` (6,251 lines incl. tests): LiveKit agent, providers, speech audio, turn timing. Dormant while voice calls are admin-only. Not read in detail (unverified). Its states mirror machine 16.

---

## Model pattern (board modules): exactly how they are structured

The AGENTS.md says "the tests of these modules are the pattern for later ones". What they do:

- **Pure core, no DOM, no clock, no randomness.** `board-history.ts` (839 lines) holds the data type (`BoardHistory`), the rules (`penHolder`, `drawStroke`, `takePen`, `undo`, `clear`) and returns `Change = {ok:true,history} | {ok:false,code,reason}` values. Every function takes the time as an argument (`t`, `now`).
- **One seam per outside thing, named in the header.** `DraftStore` (read/write/remove/keys), `BoardLocks` (`tryTake`, optional `force`), `BoardChannel` (`post`, `listen`), `TabTimers` (`sleep`). The browser versions live in the component (`our-board.tsx:85-140`: Web Locks, BroadcastChannel, real timers). `leaseLocks` is itself pure over `DraftStore` + `TabTimers`.
- **In-memory twins in one file.** `board-history-memory.ts`: `createMemoryDraftStore` (with `fill()` to make storage full), `createMemoryLocks` (with `crash(tabId)`), `createMemoryChannels`, `createFakeTimers(advance)`. Tabs of one browser share them. Similar twins exist for the PIN (`parent-pin-memory.ts`, which yields before each step so concurrent calls interleave), the call store (`maya-call-memory.ts`), the notice (`maya-notice-memory.ts`), the minutes ledger and the spend ledger.
- **One choke point for the dangerous transition.** `board-session.ts` `end(reason)`: every way out of holding goes through it; it ends the stroke, then either saves or keeps the ink with a note. The component only forwards events and paints `view()`.
- **Role as a small state, with a synchronous ownership check.** `TabRole = holder | reader`; `SessionView.role` adds `opening`; the lock is checked before each edit (`owns()`), so a lost lease is noticed at the next action.
- **Tests drive the real modules on the memory seams.** `board-session.test.ts` (17) opens a real `openBoardTab` and checks "a stroke ends up in exactly one place"; `board-tab.test.ts` (12) uses the fake timers for `HAND_OVER_MS`; `board-history.test.ts` (46) covers rules and drafts. Test headers cite the review round (R370-x) that produced each case.
- **Where the pattern is NOT yet used in this area:** the desk lock rule copies (machine 1), the chat ink sender hook `useInkSaver` (machine 14), `useDeskChat` (machine 15), the chat message lease in SQL (machine 13), the call status lifecycle (machine 8), the Stripe level of the chat gate (machine 7).

## Cross-area references (not inventoried here)
- Weekly Maya email (`email_log` kind `maya_weekly`, `claim_maya_weekly`, `src/lib/maya-weekly-email*.ts`) reads `note_pending`, `status`, and `kind in ('family','chat')` from `maya_calls`.
- The `sendEmailOnce` send ledger (`src/lib/email-delivery.ts`) backs the alert status machine.
- The family deletion state (the proxy tri-state) and workbook delivery receipts (the desk's `awaiting-delivery`) belong to other areas.
- The same attempt-counter shape appears in `claim_family_delete_attempt` / `family_delete_codes` (another area).
