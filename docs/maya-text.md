# Maya text sessions and the trace format (#322)

A text session runs Maya on one question with text in and text out: no room, no audio. The voice agent (#326), the test bench (#323) and the admin demo (#324) build on it.

## Run one

```sh
npm run maya:text -- --list
npm run maya:text -- --question add-27-39 --script scripts/maya-text/no-start.txt
npm run maya:text -- --question subtract-83-46            # type the child's turns
npm run maya:text -- --question my-package.json --model openrouter
npm run maya:text -- --anthropic --script scripts/maya-text/no-start.txt   # Claude API, local key
```

| Option | Meaning |
|---|---|
| `--question <id\|file>` | A sample id (`--list`) or a question package JSON file. Default `add-27-39`. |
| `--model fake\|openrouter` | `fake` (default): a rule player, no AI. `openrouter`: `AI_MODEL` through OpenRouter. It needs `OPENROUTER_API_KEY` in the environment or in `.env.local`. Without the key the AI is off and the command stops. |
| `--model anthropic`, `--anthropic` | Maya on `claude-sonnet-5-5` and the free-talk review on `claude-haiku-5-5`, through the Claude API (`src/lib/ai-anthropic.ts`). The key is `ANTHROPIC_API_KEY` or the macOS Keychain item `anthropic-unica-tools`. A local tool only. |
| `--no-free-talk` | Every word Maya says from code. Free talk is on by default here, as in the admin demo (D-197). |
| `--script <file>` | Child turns, one per line. Without it, turns come from stdin. |
| `--runner livekit\|plain` | `livekit` (default): LiveKit Agents for Node in text mode, with no room. `plain`: the text adapter alone. |
| `--trace <file>` | The trace path. Default `traces/maya/<call id>.json` (not committed). |
| `--seed <n>`, `--name <name>` | The wording seed and the child's name. |

Script lines: a child turn, `/wait <seconds>` (the clock moves on and the pause policy runs), `/write start`, `/write done`, `/quit` (the child hangs up: the call ends as `child_stopped`). `#` starts a comment. A script or piped input uses a simulated clock (4 seconds a turn, plus each `/wait`). Typed input uses the real clock.

`OPENROUTER_API_KEY` is a Vercel Secret variable, so `vercel env pull` cannot read its value. Put the key in your shell for a real-model run.

## What reaches the child

Nothing reaches the child unless the session's `step` accepts it (`src/lib/maya-text.ts`):

1. The model gets the session's offers for this turn: the allowed acts, their code-written lines, the warm groups with their phrases, and the board offers. It returns a version 2 proposal (`src/lib/maya-model.ts`, prompt `PROMPT_VERSION`).
2. `step` checks the proposal. The board core (`applyBatch`) then checks each board batch the session builds from it.
3. If either refuses, the model is asked again once, with the refusal's code and reason.
4. If the second proposal is refused too, or the model fails, code replaces it with a fallback (`fallbacks` in `src/lib/maya/session.ts`). A fallback is code lines or a bank phrase from the session's own offers, with no free talk and no board, and `step` checks it like any proposal.
5. If no fallback is accepted, the call ends as a technical issue and Maya says nothing.

**The fallback keeps what code can check (#389).** Only the model's words are replaced. The fallback carries each answer of the refused proposals' readings that code checks alone, as it checks the answers of an accepted proposal: the child said the number in this turn and kept it, the step is a worked step, a final answer is the last number the child kept outside their explanation (D-199), and the model's verdict is the one the answer key and the worked steps give. An answer whose verdict code does not confirm is dropped, never turned round. So a right step is recorded and said ("Yes! 7 + 9 = 16."), and the help goes on from the first step still not done; a right final answer is accepted. No other field of a refused reading is kept: `paper`, `help`, `writing`, `offTopic`, `unsafeRequest` and `correctsHearing` are the model's word only, and would change the outcome or the help allowed. As before, `step` keeps a refused reading's safety, stop, unclear and no-start fields, which only make Maya more careful (the safety guidance, a close, a confirmation, the easier example).

Three rules of the controller go with it. A checked right answer on the child's question shows they have started: a no-start no longer holds, and the easier example does not start after it. Writing that ends after the answer is solved is the child writing it (`wrote`): the request to write is no longer offered, and neither is it after the reading `paper` was accepted. The final step after the last column ("result") has its own help line, an H0 invite to put the whole answer together (`step.invite` with the step `result`).

## The child's final answer and the final step (D-199)

**Reading the final answer.** Code reads the child's final answer without the answer key (`readAnswer`, `src/lib/maya/numbers.ts`). First the last word that takes something back wins ("no", "wait", "I mean", "actually", "oops"): "65, no, 66" is 66. Then the child's explanation is left out: it runs from "because", "since", "cause" ("'cause"), "cuz" or "coz" to the end of that turn, or to a word that takes something back. The final answer is the last number left, unless it is inside an operation ("27 plus 39") or offered as a choice ("66 or 56?").

| The child says | Final answer |
|---|---|
| So I got 66, because six tens and six ones. | 66 |
| I think it's sixty-six because seven and nine make sixteen. | 66 |
| 65, no, 66. | 66 |
| 66 because six tens and six ones. No wait, 65. | 65 |
| I got 56 because 27 and 39 make 66. | 56 |
| I got 66 because I added them. | 66 |
| Because seven and nine make sixteen. | none |
| Because 7 + 9 is 16, it's 66. | none: Maya asks again |

A number in an explanation is never the final answer, so an explanation that comes first leaves no answer, and Maya asks rather than guess. A step answer may still come from the explanation ("seven and nine make sixteen" is the ones). A number form code cannot read ("six tens") holds the turn for a confirmation only when it is outside the explanation. The behaviour gate judges an accepted answer by the same rule.

**The final step.** Once every work step is done, the final step has one help line, the H0 invite (`step.invite` for "result"). Each checked wrong final answer after that counts (`finalMisses`). After the second, Maya may only give the answer (`give_answer`, or a confirmation): the gentlest help again is refused. Code says two lines: how the parts make the answer (`answer.parts`, filled from the checked answer's digits by place: "6 tens and 6 ones make 66."), then the answer and the request to write it (`answer.give`). Neither comes from the model, and the model may add only a warm phrase before them. The call then goes on as after any given answer: the answer is solved by Maya, the assistance is answer_given, the highest hint is H4, understanding stays uncertain, and the next turn closes. A right final answer is still accepted after one wrong one. Code's fallback gives the answer first on this step. Wrong final answers before every column is done do not count.

## Fractions (D-204, #407)

Maya teaches adding and subtracting two fractions (`fraction-add`, `fraction-subtract`), with like or unlike denominators. A question with a step Maya has no lines for stays held (`content_issue`): a mixed or whole number to add, multiplying, dividing, simplifying alone and equivalent fractions (`TEACHABLE_KINDS`, `TAUGHT_STEP_KINDS`).

**Reading fractions.** In a fraction call only, `readAnswer` and the other readers take `{ fractions: true }` (`readOptionsFor`), which first writes the exact spoken forms code reads (`writtenFractions`, `src/lib/maya/numbers.ts`). Anything else stays unread, so Maya confirms it. In a whole-number call nothing changes: "three quarters" is still confirmed.

| The child says | Read as |
|---|---|
| three quarters, three fourths, 3 over 4, 3/4 | 3/4 |
| fourteen sixteenths, 7 eighths | 14/16, 7/8 |
| a half, one eighth (at the end of a clause, or before "of", "and", "is", "plus", "because") | 1/2, 1/8 |
| one and three eighths, 2 and a half, 1 and 3/4, 1 3/8 | 1 3/8, 2 1/2, 1 3/4, 1 3/8 |
| three quarter, one quarters, 7 8ths, five twenty-fourths, three quarters of 8, six sixty sixteenths | unread: confirmed |
| a third time, a quarter past 3 | not a fraction |

**Right answers.** `rightForQuestion` (`src/lib/maya/fractions.ts`): the package's rules (`isRightAnswer`: the answer or any simplest form, so 11/8 and 1 3/8 are both right), and an equal fraction in another form (14/16 for 7/8) unless the question asks for the simplest form or lowest terms, or the package lists that form as wrong. Maya says an accepted equal form back as the child said it ("Yes! 3/4 + 1/8 = 14/16.", "Please write 14/16 on your paper.") and does not bring up simplest form. When the question asks for it, an equal fraction is the right amount (`isEqualForm`): not a wrong final answer and not a failed attempt; every work step counts as done; Maya says `check.equal` in the question's own words, and the final step's help adds H1 and H2 lines to simplify the child's own fraction.

**Steps.** The package's steps: the common denominator (`3/4 = 6/8`; the child says 6/8 or 6, never 3/4), the numerators (`6 + 1 = 7`), and the simplest form only when the question asks for it (`teachSteps`). The mixed number is never a step. No help line, judged step or shown step says the final fraction: the child puts it together on the final step. Saying back an equal form the child said is not giving the answer away; the answer's own written form is.

**Board.** `question.strips` draws each fraction as a strip (denominators up to 12), the second below the first; `question.common` draws them in the common denominator once that step is done or shown; `example.strips` draws the easier example.

## Free talk (D-197)

With `freeTalk` on (the admin demo, the practice suite, this command line), the model may write its own words (`{ "talk": ... }`) in a turn with no math line. Math, answers, hints and steps never come from them. Each piece is said only when both checks pass:

1. The code guards (`freeTalkProblem`, `src/lib/maya/phrases.ts`): no banned everyday phrase (`PLAIN_LANGUAGE_BANNED`, D-202: "in all", "altogether", "all together", "total", "left over"), an allowed opener, no request, no math, no work word, no pointing back, at most three short sentences (`FREE_TALK_LIMITS`), not the child's name. A few everyday phrases about the conversation pass although a word in them is on a list (`SAFE_PHRASES`: "keep secrets", "secrets to share", "you told me", "thanks for sharing", "you shared it", "right here", "feel that way"), and "I want to" or "I don't want to" is a statement, not a request. The word alone stays refused ("Keep going.", "I told you.", "Share them.", "That's right!").
2. The review (`src/lib/maya-talk-review.ts`): a separate small AI call (`MAYA_REVIEW_MODEL`, default Claude Haiku 5.5) that judges the line against `NEVER_SAY` (`src/lib/maya/talk-review.ts`): what Maya must never say to a child. It reads the line, the child's last turn and the last turns of the call. A failed call, a time-out (8 seconds) or an answer outside its schema counts as a fail. Brief empathy that names what the child told ("I'm sorry your grandma is sick. That sounds really hard.") passes; asking more about it fails. "A grown-up you trust can help", naming no person, passes only for a child who says they are sad, worried, scared or unsafe; to any other child, or with a named person, it fails (`NOT_OK_TALK`). Check the review with `npm run maya:practice -- --anthropic --review-check`: each `NEVER_SAY` and `NOT_OK_TALK` line must fail and each `OK_TALK` line must pass.

The adapter steps the proposal once with no reviews, to learn which words the session would say. It reviews those (in parallel), then steps the proposal again with the reviews. A piece that fails a check, or has no review, is replaced by a bank phrase of the same purpose (for small talk, a reply that fits any child turn: `FEELING_SMALLTALK` when the child's turn tells a hard feeling, such as "Aw, it sounds hard. I'm glad you told me.", else `NEUTRAL_SMALLTALK`, such as "Thanks for telling me."; neither names a detail of what the child said); the turn never fails for it. A refused proposal (free talk beside a math line, for example) is never reviewed.

The model ends a free-talk reply with a phrase from the `back` group ("Shall we get back to our question?"), code-written and with no math, so the reply also leads back to the question; the next turn restates it with a line. Maya confirms what she heard at most twice in a row, and never after the answer is accepted. An echo frame never repeats an insult ("dumb", "stupid" ...): code picks a frame with no slot. The easier example starts with its intro line (`example.intro`) in the turn of its first step; a first step without it is refused.

A request for sexual, violent or other harmful content (`reading.unsafeRequest`) gets the decline line `redirect.decline` ("I can't talk about this. I'm here to help with math.", one fixed wording, approved by Savar on 2026-11-01) and no free talk, then the question again.

Board commands do not change with free talk: Maya draws only through code's board offers (`draw`). Only the board core's tests read the model's own commands (`modelBoard`).

For children's calls, free talk follows one setting: `MAYA_FREE_TALK` (`src/lib/maya-free-talk.ts`, on unless it is `off`).

## Plain language (D-202)

Maya follows the plain-language rules of the workbooks (D-201), for children aged 6 to 12:

1. Short sentences, with one idea or action in each ("Multiply 4 × 7. Then add the carried 2.", not "Multiply 4 × 7, then add the carried 2.").
2. Everyday words. Never "in all", "altogether", "all together", "total" or "left over". A question about a quantity names the thing again ("How many plums does Gus have now?").
3. The math words the curriculum teaches stay (tens, ones, regroup, ten-frame, take away). Only everyday wording gets simpler.
4. In any story Maya tells, things only do what they really can (a toy does not feel or talk, a number does not wait).

Every code line (`TEMPLATES`, `src/lib/maya/lines.ts`) follows them, and `src/lib/maya/math-lines.test.ts` checks the banned phrases in every filled line and every shown step, and that no line joins two ideas with ", so", ", then" or ", because". One exception: Savar approved "Now put it all together. What is {expr}?" (`invite.result`) as it is. A changed wording stays at its place in its list, so its id (`key#index`) in the child's wording history (#375) stays. The warm-talk bank (`PHRASES`) is not changed: Savar keeps it as it is.

For the model's own words, the rules are in the prompt (`SYSTEM_PROMPT`, `maya-text-11`) and in the review (`plain_language` in `NEVER_SAY`, `maya-talk-review-5`). Code checks only the exact banned phrases (`plainLanguageProblem`): in free talk and in an echo, a phrase that holds one becomes the bank phrase of the same purpose, and the review is not asked. Most of them were already refused as math words ("in all", "altogether", "left"); "all together" was not.

## The trace

`src/lib/maya-trace.ts`, `TRACE_VERSION` 3. Read a saved trace with `checkTrace`; it reads versions 1 to 3. Version 3 (D-197) adds free talk: `reviewer` (the review's model and prompt version, or null), and on the accepted attempt `talk` (each piece of the model's own words: `proposed`, `code` (null when the code guards passed, else why not), `review` (`pass`, `fail`, `error` or `not_run`), the `rules` and `reason` of a failed review, and `shown`, what was said) and `reviewMs`. `checkTrace` refuses a piece shown as proposed unless both checks passed, a piece not shown as proposed unless it became a bank phrase, a review after failed code guards, and an unknown rule. The admin demo shows these pieces under "Free talk" in a saved call. Version 2 (#323) adds the `hang_up` turn: the child hung up on purpose. It is always the last turn, and the call's outcome is `child_stopped` (or safety, a content issue or solved, which come first), never `technical_issue`. A trace holds:

- `model`: the model id and the prompt version. `versions`: the proposal, line set and session versions.
- `question`: the package id, ref, text and `hash` (`sha256:` of its canonical JSON).
- `turns`: start, child, tick, writing, technical and Maya turns. A Maya turn holds the state before and after, every attempt (`model`, `repair`, `fallback`) with its proposal and refusal or error, and the `output` that reached the child.
- `board`: every batch sent, with its turn and commands.
- `outcome`, and `counts` (refusals, repairs, fallbacks, model errors, silent turns). The bench takes its counts again from `turns`.

`checkTrace` checks every field and every nested record: types, enums, the 64-hex hash, the board links and the counts against the turns. It returns the path of the first bad field.

**Every session ends with a trace.** Call `finish()` in a `finally`. If the call has not ended, `finish()` ends it as a technical issue, and starts it first if it never started. `finish({ reason: "child_stopped" })` ends it as a hang-up instead (a `hang_up` turn, the session event `hang_up`): only a real failure records `technical_issue`. An input that throws also ends the call before the error goes on. The command line (`src/lib/maya-text-run.ts`) writes the trace even when the script cannot be read, or when LiveKit does not start or close.

**Errors.** A trace never stores an error's own text. A provider's or a model's message can hold a key in any form, so the trace keeps only a code from `ERROR_MESSAGES` (`http_401`, `http_429`, `http_5xx`, `timeout`, `network`, `bad_json`, `schema_invalid`, `refused_by_provider`, `local`, `unknown`, and others), that code's fixed message, and the HTTP status. `checkTrace` refuses any other code, message or field. The raw text goes only to the `onError` hook; the command line prints it to stderr.

**Child data.** The trace writes the child's profile name as `{name}`. As a second layer, the text fields (child turns, proposals, refusal reasons, technical details) also have key-like text and the configured key values written as `[secret]`. Child turns are kept word for word otherwise, so keep traces local; `traces/` is not committed.

**Saving and going on.** `saved()` gives what the session needs to go on later (the session, its turns and board batches, plain JSON), and `resume` starts a session from it; the board scene is built again from the batches. A session saved and resumed between inputs says and records the same as one that never stopped (a test checks it). The admin test calls (#323, `src/lib/maya-call.ts`) save it in the call row between requests and drop it once the call's learning event is written. It holds the child's words and name: never send it to a browser.

Samples: `docs/maya-traces/`. A test checks each sample with `checkTrace`.

The behaviour gate (`docs/maya-gate.md`, #324) runs the research's scripted children through this adapter in `npm test` and judges each saved trace.
