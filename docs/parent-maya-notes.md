# Parent notes from Maya

Issue #419 implements option C from `.design/experiments/r331/`. Savar selected C on November 1, 2026. The new screenshots are in `.design/experiments/r419/manifest.json`. The implementation still needs Savar's approval of the look before merge.

Parent home shows one latest note per child. A child without a note has no extra section or notes link. Each note links to its own conversation and to the child's full notes list. The list shows 20 notes per page, newest first, with the call ID as the ordering tie breaker. Home reads each child separately, so a busy sibling cannot hide an older note for another child. Home and list reads omit transcripts.

The session page shows the saved note, question, result, duration and full saved transcript. It restores the child's name through `noteSentences` and `noteTranscriptLines`. React escapes all text. The question location replaces the note's first sentence, as in option C. For a chat, the displayed note uses "chat" in place of "call". Stored notes and spoken transcript lines do not change.

The date and time use the session start and `family-time.ts`. The family zone uses the saved browser zone, postal code, oldest child's province and Pacific fallback, in that order. Session labels say Chat or Call. No browser-local or UTC date formatter is used.

## Access

Routes are `/account/notes/[child]` and `/account/notes/[child]/[session]`. Each server page authenticates the parent. It reads the child with the parent's session and checks ownership before loading notes. Each note query also filters the parent and child. An unknown child, another family's child, a sibling mismatch or an unknown session returns not found. A signed-out visitor goes to sign-in. The account desk guard and private, no-store response policy also apply.

The existing `maya_call_notes` RLS protects both notes and transcripts. Parents still cannot read `maya_calls`. Migration `parent_maya_note_sessions` adds one restricted function. It returns only ID, channel and start time. Its explicit `auth.uid()` predicate requires an owned note and a matching ended family or chat session. Anonymous callers cannot execute it. It accepts at most 100 IDs. It does not return a trace, model input, pending state or rejected proposal. No existing family rows change.

The hosted rollback probe is `supabase/tests/parent_maya_notes.sql`. It creates new synthetic families. It checks owner reads, another family's denial, internal-call denial, missing-note and live-session exclusion, direct-write denial, anonymous denial and deletion cascades. The page tests use a reader without RLS, so missing server ownership filters fail independently of database policy.

## Release and evidence limits

The UI reads saved notes. It does not enable chat or calls. With `MAYA_CHAT_ENABLED` off, existing notes remain readable. New notes still use the existing writer and its test-family exclusions.

Family calls are not enabled by #419. The current database accepts admin test calls and chats. The Call screenshots use the real session-page component with synthetic call metadata through a temporary development fixture. That fixture is removed before commit. The normal session route has separate Chat and Call page tests. Hosted access evidence covers chat notes. This does not prove a live family voice call or a real device.

The browser checks use Aside account u0, `npm run dev`, two new synthetic families, and 1440×900, 768×1024 and 390×844 viewports. They make no AI request or email send. Cleanup removes the synthetic Auth users and checks the dependent records. No real family is modified.
