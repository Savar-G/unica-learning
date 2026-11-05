# Maya gap audit: what is missing before a family can use her

Audited at `origin/main` 5584bf9b on 2026-11-04. Read-only: no commit, no PR, no database write, no paid AI call.

## 1. Answer

A family cannot use Maya today. Four things block it, in this order:

1. **Maya cannot teach most of what the workbooks print, and no ticket covers it.** On tonight's real samples she can teach 0 of 196 questions at U4 and 43 of 223 at U16. Chat is one switch away from opening, but it would close at once on most questions.
2. **No real family has a workbook.** 0 shipped workbooks belong to a non-test family. The generator tickets #479 and #480 are still open.
3. **The privacy page says nothing about Maya.** This blocks chat as well as voice. Nothing about it needs an account, but it sits inside the voice ticket #327.
4. **Family voice calls do not exist in code.** There is no family call kind, route, screen, minutes grant or plan check. The accounts (LiveKit, AssemblyAI, Inworld) block real speech, but this code can be built first with fake providers.

Fastest honest path: chat first, after items 1 to 3, plus the abandoned chat fix in section 5 (G3). Voice follows.

### Evidence limits

- Local tests I ran at this commit: 14 site test files with 747 tests passed (`desk`, `maya-chat`, `maya-chat-access`, `maya-minutes`, `maya-call-note`, `maya-call-safety`, `maya-weekly-email`, `maya-voice-token`, the gate, `board`, `models`, `board-protocol`, `session`, `maya-workbook-question`). `npm run voice:test`: 7 files, 59 tests passed. These all use fakes. They prove no real speech, device or provider.
- I did not open the desk in a browser. Desk findings come from code, its tests and database counts.
- Production counts come from read-only SELECT queries. I could not read the value of `SIGNUP_NOTIFY_EMAIL`, only that it exists in Production.
- `npm ci --ignore-scripts` created the git-ignored `node_modules` in this worktree. `git status` is clean.

### Production counts (2026-11-04)

| Item | Count |
|---|---|
| Parents / marked test families | 15 / 6 |
| Workbooks: shipped, printed, draft | 2, 1, 1 |
| Shipped workbooks of a non-test family | **0** |
| Saved cards / parent PINs | 2 / 1 |
| `maya_calls` | admin_test only: voice ended 4, text ended 6, text live 1 |
| Chat calls, chat messages, notes, minute grants | **0, 0, 0, 0** |

No row shows that the family path has run in production.

### Maya's teaching coverage (the main finding)

"Teachable" means `createSession` accepts the package (`src/lib/maya/session.ts:418-420`, `TEACHABLE_KINDS` at `:81`, `TAUGHT_STEP_KINDS` in `src/lib/maya/fractions.ts`). It does not prove good teaching on each question.

| Source | Questions | Teachable | What is held |
|---|---|---|---|
| Shipped book in production, grade 0 (made 2026-11-02). Counted by kind from the database, not run through `createSession` | 247 | 81 (33%) | `missing-addend` 84, no operation 82 |
| Real sample `/tmp/ui-review/c3-real-u4/U4-draft.json` (Sonnet, 2026-11-04) | 196 | **0 (0%)** | all: no operation (write-number 93, circle 65, show-work 17, boxes 12, others 9) |
| Real sample `/tmp/ui-review/c3-real-u16/U16-draft.json` (Sonnet, 2026-11-04) | 223 | **43 (19%)** | no operation 180 (write-number 120, circle 34, show-work 18, others 8) |
| Fake generator at this commit (free, days 1, 5 and 10) | U4 196, U10 229, U16 222, U22 177, U28 179 | 0%, 19%, 19%, 23%, 27% | mostly no operation |

Limits: the two real samples may come from a branch near main, not exactly this commit. The fake runs agree with them at U4 and U16. Fake runs for U10, U22 and U28 are indications only. The U28 fake run also failed book checks.

The counts fell between the 2 November book and tonight's samples: U4 went from 33% to 0%. Story questions with real numbers are held too ("Jin has 9 cookies. Jin gives away 3."), because the package carries no operation.

**What a child sees on a held question.** The desk offers "Chat with Maya" on every question and does no check first (`src/components/desk-chat.tsx`, `src/lib/maya-chat-server.ts:115`). A scratch run of the real call module with the rule player, on "Yes or no: 3 and 4 make 6.", gave:

- Maya's only line: "I had fun working with you."
- The call ended with reason `content_issue`.
- No hello and no AI disclosure were said. The only allowed act is `close` (`session.ts:689`), so a real model can change only the words of that close.
- The parent note then says "Maya could not help with this question yet, so the call ended." (`src/lib/maya-call-note.ts:249`).

## 2. User stories

Counts: **21 done, 9 partial, 6 missing, 2 blocked by an external account.** "Done" means code on main plus a test. "(real)" means the proof is text or fake only, and a real call still has to confirm it.

| # | Story | Status | Evidence, or what is absent |
|---|---|---|---|
| 1 | See my pages on the desk | done | `src/lib/desk.ts:130`, `src/app/(product)/tutor/page.tsx`; test `src/lib/desk.test.ts:43`. No real family has a book yet. |
| 2 | Say "page 23, number 4" or tap | partial | Tap: `src/components/desk.tsx:280-288`. Speech grammar exists for admin only (`src/lib/maya-workbook-question.ts`, `worker/maya-voice/src/workbook-reference.ts`, test `worker/maya-voice/src/call.test.ts:190`). The desk has no spoken or typed selection. |
| 3 | Maya confirms the question | partial | Forced opening for admin: `session.ts:1085`, `src/app/api/admin/maya/workbook/route.ts:27`. Chat does not pass `confirmWorkbook` (`maya-chat-server.ts:115`). The scratch chat opening was "Shall we get going? Hi there! I'm Maya, an AI math helper." with no question named. |
| 4 | One-tap voice call | missing | Tabs are disabled (`desk.tsx:181-182`). `mintVoiceToken` has only admin callers. |
| 5 | Hello by name, says she is AI | partial | AI disclosure enforced: `session.ts:1123`; gate C34 `src/lib/maya-gate/behaviours.ts:178`. `open.hello` has no name (`src/lib/maya/lines.ts:124`). Voice passes a null name on purpose (`src/lib/maya-call.ts:750`, `docs/maya-voice.md:40`). Needs a decision. |
| 6 | Asks what I tried | done | `session.ts:2025`; gate C07, C24 (`docs/maya-gate.md:79,95`). |
| 7 | Easier example first | done | Gate C01 `behaviours.ts:199`. |
| 8 | Back to my own question | done | Gate C01, C05 (`docs/maya-gate.md:71,77`). |
| 9 | One step at a time | done | Gate C02 `behaviours.ts:217`, C06 `:334`. |
| 10 | Draws each step as she says it | blocked | Code half merged in #450: `docs/maya-voice.md:136`, test `src/lib/board-protocol.test.ts:56`. Real speech timing needs provider accounts (#329). |
| 11 | Take the pen | partial | Pen exists on the idle desk board: `src/components/our-board.tsx:464`. It leaves when a chat starts, because `ChatBoard` replaces `OurBoard` (`desk.tsx:185`). The voice receiver supports it, but no call screen has the control. |
| 12 | Maya never erases my ink | done | `src/lib/board/models.test.ts:394`. |
| 13 | Interrupt and ask why | partial | Interruption with fake audio: gate C15 `behaviours.ts:506`, partial for real audio (carried to #327). No "Ask why" control anywhere (search of `src/components` and `src/app`). |
| 14 | Maya waits while I write | done (real) | Gate C12 `behaviours.ts:441`, C14 (`docs/maya-gate.md:87`). |
| 15 | Checks a number she misheard | done (real) | Gate C17 `behaviours.ts:541`, C39. The 0.6 confidence rule (`docs/maya-voice.md:26`) has never seen real speech. |
| 16 | Tells the answer when really stuck | done | Gate C06 `behaviours.ts:334`; D-199. |
| 17 | Reminds me to write on paper | done | `session.ts:722-723,738-739`; gate C07. |
| 18 | See minutes left this week | missing | The desk shows fixed text "30 min a week" (`desk.tsx:144`). The ledger is not read on the desk. |
| 19 | Finishes kindly when time is nearly up | partial | Session: `session.ts:49,475-477`; gate C35 `behaviours.ts:1029`, C35c `:1052`; `src/lib/maya-minutes.test.ts:96`. No family path passes a grant's `limitMs`. |
| 20 | Brought back politely | done | Gate C26 `behaviours.ts:699`; D-221, PR #491. |
| 21 | Told to talk to a trusted grown-up | done | `session.ts:71`; gate C30 `behaviours.ts:885`, C31 `:945`. |
| 22 | Tablet: board and Maya side by side | missing | Only the admin call screen exists (`src/components/admin-maya-voice.tsx`). Chat has desk layouts (`src/components/desk.css:176`). |
| 23 | Phone: board fills the screen with controls | missing | Same. |
| 24 | Short note after each call | done (real) | `src/lib/maya-call-note.ts`, test `src/lib/maya-call-note.test.ts:126`; UI `src/components/parent-maya-notes.tsx`. 0 notes in production. |
| 25 | Read the full transcript | done | `src/app/(product)/account/notes/[child]/[session]/page.tsx`; test `src/app/(product)/account/notes/notes.test.ts:123`. |
| 26 | One email a day on days with calls | partial | Code sends **weekly** instead: `src/app/api/reminders/route.ts:79`, test `src/lib/maya-weekly-email.test.ts:66`. No D-number records this change, and #332 is closed as "Daily". |
| 27 | Unsubscribe from that email | done | `src/lib/maya-weekly-email.ts`, `src/app/api/unsubscribe/route.ts`; kind `maya_unsubscribe`. |
| 28 | Minutes in Parent home | partial | `src/app/(product)/account/page.tsx:101,151`. Test families only (`src/lib/maya-minutes-server.ts:27`). Chat usage does follow the plan switch. |
| 29 | Parent tries Maya on a sample | missing | Only the ledger's `grantDemo` (`src/lib/maya-minutes.ts`) and `SAMPLE_PACKAGES`. See #336 in section 3. |
| 30 | No audio of my child stored | blocked | App side: `record: false` at `worker/maya-voice/src/main.ts:158`. Provider retention is unverified (`docs/maya-voice.md:26,32-38`). |
| 31 | Privacy page explains Maya | missing | No "Maya", "transcript", "voice" or provider text in `src/app/(site)/privacy/page.tsx`. Terms has none either. |
| 32 | Every call stored for review | done | `src/lib/maya-call.ts:752-784`, `src/lib/maya-trace.ts`; test `src/lib/maya-chat.test.ts:27`. |
| 33 | Safety flags alert and stand out | done (real) | `src/lib/maya-call-safety.test.ts:116`; admin order `src/lib/maya-call-server.ts:177-182`. The value of `SIGNUP_NOTIFY_EMAIL` against D-167's contact@ is unverified. |
| 34 | Mishearing counted per call | done (real) | `src/components/admin-maya.tsx:208,543`; `docs/maya-voice.md:23`. |
| 35 | Change providers by configuration | done (real) | `src/lib/maya-voice.ts:125`, `worker/maya-voice/src/providers.ts:21,30`; tests `worker/maya-voice/src/providers.test.ts`. The real plugins have carried no audio. |
| 36 | Open Maya on an assessment question | done | `src/app/(product)/admin/maya/page.tsx`, `src/lib/maya-call-server.ts:76`. |
| 37 | Calls write learning events for the next book | partial | Events and rebuild: `src/lib/maya-call.ts:621`, `src/lib/maya/session.ts:494`; `src/lib/child-profile.ts:9` counts "with help" as not secure. The planner takes only `code` and `status` (`src/lib/workbook-plan.ts:332`). No real call event has gone through it. `docs/workbook-personalization.md:78,145` says calls come "later". |
| 38 | Text test bench | done | Gate `src/lib/maya-gate/gate.test.ts` (`PENDING` is empty, `behaviours.ts:1489`); suite `docs/maya-practice.md`. Open release item: see Testing below. |

## 3. Implementation and Testing Decisions

Later decisions applied: D-183 (chat tabs), D-184 (question card), D-185 and D-221 (scope), D-182 (font), D-197 (free talk), D-200, D-203.

### Screens

| Item | Status | Evidence, or what is absent |
|---|---|---|
| Desk with real pages, tap areas, Maya column, question card, pick pop-up (D-184) | done | `desk.tsx:139-193,199-208,242-258` |
| Chat tab (D-183), 60 messages a day | done, switch off | `src/components/desk-chat.tsx`, `src/lib/maya-chat.test.ts:27`, migration `20261102171510_desk_maya_chat.sql` |
| "Call" and "Call + board" tabs | missing | disabled at `desk.tsx:181-182`; nothing says how the two differ |
| Call screens for laptop, tablet, phone; controls; "Live" timer | missing | admin only; no "Ask why", no pen control |
| After-call screen ("Nice work", "Back to my page", grown-up line) | missing | no such screen in `src/components` or `src/app`; chat only offers "Chat again" |
| Zero minutes state on desk and Parent home | partial | chat cap done (`desk-chat.tsx`, `maya-chat.ts`); Parent home text at `account/page.tsx:159`; no voice state on the desk |

### Maya's session

| Item | Status | Evidence |
|---|---|---|
| State machine, interrupts, priority | done | `session.ts:85-86,680-689`; `src/lib/maya/session.test.ts:79` |
| Hint ladder, answer may be given | done | gate C06 |
| Code owns math, clock, board, flag; lines from code (D-195) | done | `lines.ts`, `claims.ts`; gate V2 |
| Inputs and outputs, outcome fields | done | `session.ts:100,147`; `session.ts:1742` |
| 9 and 10 minute limits | done | `session.ts:49` |
| Child speech is data | done | gate C10, C28 (`docs/maya-gate.md:82,103`) |
| Package with worked steps and easier example for workbook questions | **partial** | most generated questions have no operation, so no steps (section 1) |

### Voice

| Item | Status | Evidence |
|---|---|---|
| LiveKit worker chain, configured parts | done, fake only | `worker/maya-voice/src/main.ts`, `providers.ts:21,30` |
| Deployed on LiveKit Cloud | blocked | no account. Also no `Dockerfile` or `livekit.toml` in the repo, and the worker has no `package.json` of its own |
| Voice picked from 4 samples | blocked | needs Inworld (#327) |
| Token for a signed-in **parent** and child | missing | `src/lib/maya-voice-token.ts:17` is right and tested (`maya-voice-token.test.ts:30,40,49,64`); only admin routes call it |
| Thin agent, no audio through Vercel | done | `docs/maya-voice.md:3,9-15` |

### Board

| Item | Status | Evidence |
|---|---|---|
| Semantic vocabulary, no coordinates | done | `src/lib/board/types.ts:44-131` |
| Layout core, carry, borrow, fraction, number line, overflow | done | `src/lib/board/board.test.ts:36,110,362`; `src/lib/board/fractions.test.ts:152`; `models.test.ts:414` |
| Renderers, font | done | `src/components/maya-board.tsx`, `our-board.tsx`; `src/lib/board/fonts.test.ts:116`; D-182 |
| Child's ink protected | done | `models.test.ts:394` |
| Reuse stroke model, drafts, replay | done | `src/lib/board-history.test.ts`, `src/lib/board-session.test.ts`, `src/components/admin-maya-replay.test.ts` |
| Transport and sync | done, fake only | `board-protocol.test.ts:56,79,96`; `docs/maya-voice.md:136-146` |
| Child's ink saved with the call | **partial** | text and chat calls store Maya's history only (`maya-call.ts:714`); desk ink stays in its draft store |

### Limits, data, parent side, safety and review

| Item | Status | Evidence |
|---|---|---|
| Minutes ledger | done, not connected | `maya-minutes.ts:84-101`; tests `maya-minutes.test.ts:64,86,128,141,150`. No route calls `grantChild` or `grantDemo`; 0 grants in production |
| Crashed call keeps its minutes until admin ends it | gap | `docs/maya-voice.md:126`; see G4 |
| Data: call, transcript, board, deleted with family | done | `20261031_add_maya_calls.sql:71`; `docs/parent-maya-notes.md` |
| `family` call kind | **missing** | `src/lib/maya-call.ts:72` and `20261102171510_desk_maya_chat.sql:3` allow only `admin_test` and `chat`, while notes and recaps already expect `family` (`maya-call-note.ts:47`) |
| Notes AI-written | changed | code facts with one AI-picked warm sentence (AGENTS.md, #331). Stricter than the spec; accept |
| Learning event per call | done | `maya-call.ts:621` |
| Parent home: notes, minutes, "Try Maya" | partial | notes done; minutes test families only; "Try Maya" missing, yet `account/page.tsx:108` describes it to test families |
| Daily email | changed | weekly in code; see story 26 |
| Privacy text | **missing** | story 31 |
| Safety interrupt, alert | done | `maya-call-safety.test.ts:116`; D-203 |
| Admin list, call view, replay, assessment entry | done | `maya-call-server.ts:177`, `admin-maya.tsx`, `admin-maya-replay.test.ts` |

### Testing Decisions

| Item | Status | Evidence, or what is absent |
|---|---|---|
| Public interface tests, session cases | done | `session.test.ts`, gate |
| Board layout cases | done | as above |
| Transport with in-memory seam | done | `board-protocol.test.ts`, `src/lib/board-protocol-memory.ts` |
| Minutes tests, two zones, cap, demo, server time | done | `maya-minutes.test.ts:43-205` |
| Test bench, deterministic on every change | done | gate in `npm test` |
| Real-model practice on Maya changes | partial | the docs say the subscription pass is accepted for merge and that **a full API run is required before real families** (`docs/maya-practice.md`, "Subscription runs"). I found no record of that run in the docs or in the bodies of nine Maya PRs I checked (#386, #388, #390, #391, #401, #402, #409, #410, #491); this is not a full search. PR #401 says "The API credit is empty (decision 2026-11-01)". The suite defaults to free talk on and has no chat channel (`src/lib/maya-practice/practice.ts:163`), while family chat runs with free talk off. Cases use hand-made fixtures, not generated workbook packages (`cases.ts:199`) |
| Aside checks of desk and call screens | partial | chat and notes done in rounds r358, r419; call screens do not exist |
| Real call on Chrome and Safari iPad | blocked | no accounts, no family screen |

## 4. Open tickets

| Ticket | Not met | Can finish with no external account |
|---|---|---|
| **#327** Deployed voice setup | Deployed worker; audio-off settings verified; privacy page; voice choice; warm and cold delays; C15 and C21 real checks | **Privacy page text.** `Dockerfile`, `livekit.toml`, worker packaging and a deploy doc. Everything else is blocked. Split the privacy item out, because chat needs it first. |
| **#329** Board with speech | "Drawing follows Maya's words in a real call"; "Cue timing is measured and reported". Code half is merged (#450) | Nothing more. Leave open until keys exist. |
| **#335** Admin workbook call | Tap and text are done (#493). Remaining: real microphone reference in a real room; voice call on Chrome and iPad | Nothing more. Fake-provider proof already exists. Its "Maya confirms" and "refused" items are met in code. |
| **#336** Try Maya | All. Daily cap wired; child minutes and records unchanged; UI through `/design`; Aside checks. Formally blocked by #327 | Yes as a **text** sample, if Savar accepts text first (see decisions). Needs design work: `maya_calls.child_id` is `not null` with a family foreign key (`20261031_add_maya_calls.sql:32,71`), while a demo grant has a null child; `kind` needs a new value; `SAMPLE_PACKAGES` use `workbookId: "sample"`, which is not a UUID; note, event and profile steps must be skipped. |
| **#337** Family call | All 6 items. Hidden scope: `family` kind migration and type; parent token route; plan check on token and start (reuse `chatAccess`); `grantChild` at start and pass `limitMs`; `freeTalkFor("child")` in place of the fixed `admin_test` at `maya-call.ts:586`; `confirmWorkbook`; pass `grade`; call and after-call screens; desk minutes; a voice switch | Yes, nearly all the code, with fake providers and a local LiveKit dev server. Not the real Chrome and iPad acceptance item. Blockers still open: #327, #335, #336. The ticket predates D-183 and D-184: it should say what "Call" and "Call + board" mean. |
| **#338** Glimpse after assessment | Savar's approval of allowance and start date. Marked later | No work. Leave it. |
| **#418** Read new Maya sentences | Savar has not marked the 30 flagged rows. The flagged wording is still in code: "Shall we" and "Let's head back" (`src/lib/maya/phrases.ts:79,145-147`), "I hear you" (3 hits), "I'm here with you" (6 hits), "Aw, it sounds hard" (2 hits), "gave 1 to the" (4 hits in `lines.ts`). Also `docs/maya-practice-lines.md`: 43 lines, "Launch approval is pending". D-204's fraction lines are also listed as pending. Note 2 of the ticket needs a real voice | The reading needs only Savar. Listening to fractions needs Inworld. |

## 5. Switches and gates

### Today

| Gate | Where | Effect today |
|---|---|---|
| `MAYA_CHAT_ENABLED` | `src/lib/maya-chat.ts:36` | Unset in production: real families have no chat |
| Plan check | `src/lib/maya-chat-server.ts:18-43` | Stripe `trialing` or `active`. Unknown, canceled and past due fail closed. Test families bypass it. The check is per family |
| Desk child and shipped workbook | `src/app/api/desk/chat/route.ts:28-33`, `maya-chat-server.ts:103-104` | Foreign, sibling and unshipped are refused |
| Test family gate on calls | `maya-call.ts:742`; database trigger in `20261031_add_maya_calls.sql`; `maya-workbook-question.ts` | Calls are for test families only |
| Test family gate on minutes | `maya-minutes-server.ts:27` | Parents do not see minutes |
| Note and recap exclude test families | `20261101_add_maya_call_notes.sql:59-72`; weekly store | Test families can never see a note |
| `maya_calls_kind_check` | `20261102171510_desk_maya_chat.sql:3` | No family call can be stored |
| `LIVEKIT_*` | `docs/maya-voice.md:56-60` | Unset: no Speak option, no token |
| `MAYA_VOICE_PRIVACY_CONFIRMED`, `MAYA_STT`, `MAYA_TTS`, `MAYA_VOICE` | `src/lib/maya-voice.ts:125` | The worker refuses real providers without the markers |
| `MAYA_FREE_TALK` | `src/lib/maya-free-talk.ts` | No effect yet: chat is off, admin is on. Nothing calls `freeTalkFor("child")` |
| Parent PIN, desk cookie | `src/app/api/desk/open/route.ts:26-27` | PIN needed to open a desk |
| Voice family switch | none | Does not exist. #337 should add one |

Production also has `OPENROUTER_API_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `EMAIL_FROM` and `SIGNUP_NOTIFY_EMAIL`, by name.

### Does the desk work for a real family today with a shipped workbook?

**Yes for reading, by code and tests; no real family has done it.** `/tutor` has no plan or test-family gate. With a shipped book and a PIN, the child sees pages, tap areas, the question card and the idle board with a pen. Chat and calls show "Chat and calls with Maya start soon." (`desk.tsx:170`). The Sound and Progress controls are disabled.

### Before chat can open to a paying family

1. Decide and build coverage and the held-question behaviour (G1, G2).
2. Ship one real workbook (#479, #480, then admin approve and ship).
3. Privacy and terms text (#327 part, G6).
4. Decide on #418 and `docs/maya-practice-lines.md`.
5. Fix abandoned chats (G3).
6. Run the full API practice suite, about USD 17, with chat settings added (G5). This needs Savar's approval to spend.
7. Verify `SIGNUP_NOTIFY_EMAIL` is contact@ and send one test flag (D-167).
8. Confirm the OpenRouter account has training providers off (AGENTS.md, #182) and has credit. PR #401 says an API credit was empty on 2026-11-01, and I could not tell which key it means. A child's chat needs this key. I could not check either item.
9. Fix the "anytime" copy (G7).
10. Set `MAYA_CHAT_ENABLED=on`.

### Before voice can open

All of the above, plus: the three accounts and worker key; the privacy gate (G8); deploy; voice choice; delays; #329 and #335 real checks; #336; #337 code; real Chrome and Safari iPad calls; a real test safety flag.

## 6. Gaps no open ticket covers

Ranked by what blocks a family. **[S]** needs Savar's decision.

| # | Gap | Where the code goes | Why it matters |
|---|---|---|---|
| G1 **[S]** | Maya can teach 0% to 33% of real workbook questions | Either the generator attaches an operation and steps (`src/lib/workbook-generator.ts`, `workbook-generator-items.ts`), or new Maya teaching kinds (`src/lib/maya/session.ts:81`, `fractions.ts`, `lines.ts`), or both | Chat and voice fail on most questions. Stories, number bonds, place value and true-or-false all close at once |
| G2 **[S]** | A held question closes with "I had fun working with you." and no explanation | Pre-check in `src/lib/desk.ts` and `src/components/desk-chat.tsx`; a code line for the hold in `lines.ts` | A stuck child gets a cheerful goodbye. The parent note admits failure. Also no AI disclosure in that call |
| G3 | An abandoned chat or call never ends. No job ends a live call. Note, learning event and recap run only at end | Sweep in `/api/reminders` or its own cron, calling `calls.input(..., {type:"end"})`; `src/lib/maya-chat-server.ts`, `src/lib/maya-call.ts` | A child who closes the tab leaves no note and no event. Found by reading the code; no search hit for a sweep in `maya-call.ts`, the chat server, `/api/reminders` or `vercel.json`. Not seen in production yet: the one live row is 28 minutes old, so it is probably a test now running |
| G4 | A crashed voice call keeps its minutes counted until someone ends it in admin | Same sweep; `docs/maya-voice.md:126` | A family silently loses up to 10 of 30 minutes |
| G5 | Practice suite does not cover what families get: no chat channel, free talk on by default, hand-made fixtures | `src/lib/maya-practice/practice.ts:163`, `cases.ts` | A pass does not describe chat, or generated questions. Add a chat run and cases from real packages |
| G6 **[S]** | Terms page has no Maya text, and there is no parent consent step before a child's words go to AI | `src/app/(site)/terms/page.tsx`; a step on Parent home or desk open | `docs/maya-voice.md:36` names parent consent as unresolved. #327 covers only the privacy page |
| G7 **[S]** | "Your child can call the Unica Teaching Assistant anytime" conflicts with 30 minutes a week. Spec flagged it; no ticket | `src/components/curriculum-page.tsx:29`; also `src/app/(site)/pricing/page.tsx:34`, `src/components/how-it-works.tsx:50`, `src/components/sections.tsx:180` promise spoken help | Paying families are promised what does not exist, and a limit they are not told about |
| G8 **[S]** | The spec defers provider terms for children's data (D-163, Out of Scope), but the worker refuses to start without a `child-use-approved` marker that requires written confirmation (`docs/maya-voice.md:36-38`) | Decision, then worker env | Blocks real voice by itself. Nobody owns it, and the marker cannot verify anything |
| G9 **[S]** | Which grades use Maya. Spec says ages 6-12; product is K to 9. `turnWordLimit` gives K and grades 8-9 the 25-word limit by default; D-206 defines only 1-7 (`session.ts:2009-2010`). A K-2 child cannot type, so chat does not serve them | `session.ts`, gate grade cases, desk | 13 of 50 stored children are K-2 and 9 are grades 8-9 (test families included) |
| G10 **[S]** | No staged rollout and no rehearsal. `MAYA_CHAT_ENABLED` opens every plan family at once, and test families can never get a note or recap | `src/lib/maya-chat.ts:36`; an allow list; or a rehearsal with one family marked not-test | The first note and recap in production would be a real family's |
| G11 | Pen disappears when a chat starts, and desk ink is not saved with the call | `desk.tsx:185`, `desk-chat.tsx` `ChatBoard`, `maya-call.ts:714` | D-184 shows the pen on the shared board. #358 is closed, so no ticket holds this. Spec says ink is saved with the call |
| G12 | The decision record is incomplete on main. D-161 to D-169 are absent (`.design/decisions.md` jumps from D-160 to D-170). D-161 to D-166 sit only on open PR #294 (not updated since 2026-10-30), with the `ta-*` research that `docs/maya-gate.md` and `cases.ts` cite. D-167 is only an issue comment. AGENTS.md still names `src/lib/maya-daily-email.ts`, which does not exist | Merge or extract #294; add rows for D-167 and the weekly email; fix AGENTS.md | Agents cannot read the rules they must follow |
| G13 **[S]** | No spending cap for Maya. Scanning has one (D-208, USD 50). Per-child limits exist, but no global stop or alert | `src/lib/maya-call-seams.ts` | Low risk at this size. A decision, not urgent |
| G14 | Each chat message reads Stripe live, with no cache (`route.ts:33`, `maya-chat-server.ts:36`). Each read can wait 10 seconds | `chatAccess` | Slower turns, and a Stripe problem stops chat. Not measured |

Dropped for lack of evidence: first-word delay, Safari audio, child speech accuracy. These are real risks already in #327 and #337.

## 7. What to run next

**Decisions for Savar first**

1. **G1, the largest:** should the generator attach an operation to every question that has one (stories, number bonds), and which remaining formats must Maya teach before launch? My recommendation: make the generator attach operations first, because this is the cheapest and raises coverage at every level. Then add `missing-addend` and `count-up` lines for young levels, then decide on place value and true-or-false.
2. Is chat alone an acceptable first release, given it does not serve K-2 well (G9)? I recommend yes, with a grade 3 and up limit stated plainly, if Savar accepts it.
3. G2 wording; G6 consent; G7 copy; G8 provider terms; G10 rollout; hello by name in voice (story 5).
4. Whether #336 can ship as text first.
5. Approve about USD 17 for the API practice run.

**Tickets to file**

| New ticket | Covers | Account needed |
|---|---|---|
| Workbook questions carry what Maya needs; coverage count in the sample report | G1 | no |
| Maya on questions she cannot teach yet | G2 | no |
| End abandoned chats and calls, with note, event and minutes | G3, G4 | no |
| Privacy and terms text for chat; split from #327 | story 31, G6 | no |
| Practice suite: chat settings and real packages | G5 | no |
| Curriculum and pricing copy for Maya | G7 | no |
| Board pen in chat, and ink saved with the call | G11 | no |
| Decision record clean-up, #294 | G12 | no |
| Worker packaging: `Dockerfile`, `livekit.toml`, deploy doc; split from #327 | #327 | no |

**Existing tickets**

- Run now, without accounts: #337 code with fake providers, once G1 direction is set. Update its text for D-183 and D-184. It also needs #336 as text or a changed blocker.
- Savar only: #418.
- Wait for accounts: #327 (rest), #329, #335.
- Leave: #338.
