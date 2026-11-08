# Maya first-shipment chat implementation

IMPLEMENT_DONE_MAYA_CHAT_REPAIRS

Local implementation is complete for root review. This report does not approve a merge or family release.

Computer: the assigned Mac checkout, labeled Savar's MacBook Pro (4) in the task. The system hostname is `Savars-MacBook-Pro-5.local`.

Worktree: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-4760fa45`.
Physical path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-4760fa45`.
Verified branch: `site/maya-first-chat`.
Base and latest fetched origin/main: `cfab81916a5e81d075f355c3f6c54cca646b6000`.
Frozen source commit: `894ec319168a7df0fa326d09017336bce8ea8eed`.
The later handoff commit changes this report only.

The saved worktree remains clean at `c6ff6f5e19a438d009899fac995918648e1b1d2f`. No file in that worktree changed. This branch ports selected logic by intent. It contains no old merge history.

## Resolved scope

The nine #605 defects have public-interface regression controls and scripted behavior coverage:

1. A requested confirmation can repeat the child's own number. A plain yes binds only to that confirmation. A number the child did not say remains blocked.
2. A negative removes its own clause's number or a number it explicitly takes back. An unrelated later statement of difficulty preserves earlier work.
3. Fallback help rises within the allowed ladder. It keeps the highest help level. Another explicit failure or request after H3 ends the help loop without marking the shown step as the child's completed work.
4. The opening offers no board note that its act cannot draw.
5. Working after an answer does not replace that answer. The word "sure" alone is not doubt. The one-number-sentence, correction, choice, and explicit-final-answer restrictions remain.
6. A regroup explanation is bounded. A turn avoids a repeated equation. Addition and subtraction have checked explanations for a specific carry or trade question.
7. A child who has written the answer can close. A child who is still writing keeps the wait. An exact done statement after acceptance can close without another child turn.
8. Fallbacks retain checked progress and the permitted reading fields. Invalid readings cannot add unchecked work or clear a pending scope duty.
9. A flipped column of the stored subtraction remains an error on that question. Other arithmetic remains outside the teaching scope.

The required #624 arithmetic checks refuse false equations, wrong written digits, wrong carry sources or destinations, unreadable claims, and ambiguous column relations. The checked fraction reader preserves an answer beside a nonnumeric method sentence such as "I used eighths." Paired controls still refuse uncertain or numeric method claims. No new wrong-explanation policy was added.

Held questions say, in code's words, "Hi, I'm Maya, an AI. Sorry, I can't teach this question yet. Want to pick another question on this page?" (D-304, 2026-11-08; this note first said the invitation alone). They teach no unsupported content and write no learning event. The trace reader accepts only the exact controller-owned held output. The parent note reports the invitation only when the delivered transcript contains it. D-279's desk pre-check hides the chat start button for an unsupported selected question. It gives no inability message. Reference entry remains available for another question.

#677 now uses `parseWorkbookReference` in family chat. Typed `page N, number M` and taps select the same stored package. Parent and child come from the authenticated desk context. Ownership and shipped status precede the package read. A missing page is refused from page metadata before any package read. Selection checks the package reference and checks shipment again after storage reads. The family path does not call the full-workbook reader. The fixed opening names the page, number, and stored question before teaching.

The family checks cover guessed workbook IDs, another child, another family, draft/approved/printed books, missing pages, competing references, a changed package reference, shipment changes during selection, a stale message revision, a different desk, and reuse of a call ID for another question. The existing notice, plan/list/grade, PIN/desk, message-cap, and spending checks remain.

The existing chat input accepts a reference before a chat starts. It ends an active question before it opens another reference. A lost start reply retains its request ID for retry. A typed selection uses the same question card and URL as a tap. The desk removes Calls, 30 minutes a week, Call, Call + board, and the call-only board prompt. The dashboard source is untouched.

## Fresh checks

Frozen source: `894ec319168a7df0fa326d09017336bce8ea8eed`.

- Exact 49-file local check: **4,057 passed, 0 failed, 0 skipped**. Runtime: 174.49 seconds. One worker.
- `next typegen`: passed. This generated the route and image types for the new checkout. It did not build the site.
- `npx tsc --noEmit --incremental false`: passed.
- Changed-file ESLint: passed, with no warnings.
- `git diff --check`: passed.

The initial current-main regression run had 183 failures and 166 passes across 349 tests. It ran before the source repair. The initial family-selection controls had 13 failures and one pass. The typed-reference UI controls had two failures before implementation. The unsupported-question desk control also failed before its pre-check was added. These counts are separate runs and must not be added.

The saved WIP's old green counts were not reused. Its full historical tree was not rerun. It contains excluded work. The fresh regression result here applies to the scoped port on current main. Intermediate failed or interrupted logs are kept for diagnosis. They are not final-pin evidence.

Subsystem proof:

- Controller and arithmetic: scripted public sessions prove the tested acceptance, refusal, help, writing, and closing transitions. They use fake proposals, not a live teacher model.
- Text state and trace: the 2,000-seed state check, recovery tests, and changed-trace controls prove the tested local replay and refusal behavior. They do not use a hosted worker.
- Family selection: public `runChat` tests prove the local read order, ownership, lifecycle, reference, and confirmation checks. Database and call-store seams are local. Hosted RLS and real concurrent database admission are not proved here.
- Desk input: DOM tests prove typed-reference requests, end-before-start, retry identity, and the held-button rule. They do not prove a browser's navigation, layout, or session behavior.
- Notice, desk guard, and spending: local tests preserve the tested refusal, safety guidance, alert, and cap assertions. They do not prove a live account's settings or provider accounting.

Evidence is under `traces/maya-chat-repairs-20261106/` in this checkout. This folder is ignored by Git. Root can read:

- `frozen-tests.log` and `frozen-tests.json`.
- `frozen-source.json`, including the source commit and file hashes.
- `final-files.txt`, the exact 49 test paths.
- `frozen-types.log`, `lint-frozen.log`, and `typegen.log`.
- `main-red.log`, `family-red.log`, `ui-reference-red.log`, and `desk-held-red.log`.

The spending test fixture keeps its configured safety classification even when the teaching rule player returns a close without a reading. The guidance, flag, alert, cap, and late-input assertions were not weakened. Fake practice sentences were put in one numeric sentence where the test requires acceptance. Existing negative controls still test multiple numeric sentences. Judge thresholds, required cases, repetitions, and missing/invalid/unjudgeable failure rules did not change. Simulator and provider settings did not change.

## Exclusions and dependencies

- #642 route and retention work is excluded. No AI client, provider route, privacy page, hosted setting, or provider model configuration changed.
- No #667 number-bond teaching or other unmerged sibling teaching work was ported.
- Old investigation items 3, 9, and 12 remain for Savar: new safety-close wording, secret wording, and the response to a wrong explanation after a right answer. The saved changes for these items are absent.
- No voice worker, voice connection, voice model, voice billing, or minutes-ledger implementation changed. Shared controller fixes still affect the text adapter used by voice. This is not a voice release check.
- No generator, template, question package, print, plan, curriculum, migration, flag, family switch, dashboard source, or printed Maya line changed.
- No provider or subscription model call, key/secret read, hosted write, browser task, push, PR creation, or merge was performed. Provider spending in this task: USD 0. Paid Maya practice used in this task: 0.
- No additional implementation dependency on #642 or #667 was found. Unsupported teaching kinds still follow the held path. This branch does not add general teaching support for every printed item.

## Remaining work before first-shipment chat can pass

1. Root obtains independent review of the frozen source and this scope. The change exceeds the Sol review size threshold in the current instruction file. Resolve any supported finding before paid practice.
2. Root coordinates the full gate. Exact commands:

```sh
npm test -- --maxWorkers=2
npx eslint src
npm run build
```

3. Root runs the required API practice only after the repairs and independent review pass. The estimate command for the chat/generated-package path is:

```sh
npm run maya:practice -- --channel chat --generated --estimate
```

Root must set a numeric `--max-usd` after that estimate. The two-run total limit remains. A fake or subscription pass cannot replace API acceptance. If two paid runs fail, root reports the counts and stops. The separate free-talk review gate remains for any future release that uses free talk.

4. Root checks the real desk in the browser: notice and PIN/desk guard, current shipped book, typed and tapped selection, question opening, page/card navigation, held items, progress and closure, retry/reload, and chat-only presentation. Hosted authorization and lifecycle checks remain unverified here.
5. Root chooses the reviewed chat-only integration and handles publication, preview/production checks, and any later family-release decision. Existing PRs #624, #642, and #667 are unchanged. The family switches stay unchanged.

No new scoped local defect remains from the completed checks. That statement is bounded by the tested inputs. Live conversational quality, provider acceptance, publication, and family release remain unproved.

## Changed paths in the implementation commit

- `docs/maya-gate.md`
- `docs/maya-practice-lines.md`
- `src/app/(product)/tutor/page.tsx`
- `src/app/api/desk/chat/route.test.ts`
- `src/app/api/desk/chat/route.ts`
- `src/components/desk-chat.test.ts`
- `src/components/desk-chat.tsx`
- `src/components/desk.tsx`
- `src/components/our-board.tsx`
- `src/lib/desk.test.ts`
- `src/lib/desk.ts`
- `src/lib/maya-call-note.test.ts`
- `src/lib/maya-call-note.ts`
- `src/lib/maya-chat-server.ts`
- `src/lib/maya-chat.ts`
- `src/lib/maya-family-workbook.test.ts`
- `src/lib/maya-gate/behaviours.ts`
- `src/lib/maya-gate/gate-seeded.test.ts`
- `src/lib/maya-gate/gate.test.ts`
- `src/lib/maya-gate/gate.ts`
- `src/lib/maya-model.ts`
- `src/lib/maya-practice/cases.ts`
- `src/lib/maya-practice/practice.test.ts`
- `src/lib/maya-spend-call.test.ts`
- `src/lib/maya-text-log.ts`
- `src/lib/maya-text.test.ts`
- `src/lib/maya-trace.ts`
- `src/lib/maya-workbook-question.ts`
- `src/lib/maya/controller-fixes.test.ts`
- `src/lib/maya/example-flow.test.ts`
- `src/lib/maya/fractions.test.ts`
- `src/lib/maya/fractions.ts`
- `src/lib/maya/index.ts`
- `src/lib/maya/lines.ts`
- `src/lib/maya/math-lines.test.ts`
- `src/lib/maya/numbers.ts`
- `src/lib/maya/practice-fixes.test.ts`
- `src/lib/maya/practice-repair.test.ts`
- `src/lib/maya/practice-resumption.test.ts`
- `src/lib/maya/review-350-r2.test.ts`
- `src/lib/maya/review-350.test.ts`
- `src/lib/maya/review-624-r2.test.ts`
- `src/lib/maya/review-624-r5.test.ts`
- `src/lib/maya/review-624-r6.test.ts`
- `src/lib/maya/review-624.test.ts`
- `src/lib/maya/scope.ts`
- `src/lib/maya/session.test.ts`
- `src/lib/maya/session.ts`
- `src/lib/maya/warm-talk.test.ts`
