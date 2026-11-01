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

**The fallback keeps what code can check (#389).** Only the model's words are replaced. The fallback carries each answer of the refused proposals' readings that code checks alone, as it checks the answers of an accepted proposal: the child said the number in this turn and kept it, the step is a worked step, a final answer is the last number the child kept, and the model's verdict is the one the answer key and the worked steps give. An answer whose verdict code does not confirm is dropped, never turned round. So a right step is recorded and said ("Yes! 7 + 9 = 16."), and the help goes on from the first step still not done; a right final answer is accepted. No other field of a refused reading is kept: `paper`, `help`, `writing`, `offTopic`, `unsafeRequest` and `correctsHearing` are the model's word only, and would change the outcome or the help allowed. As before, `step` keeps a refused reading's safety, stop, unclear and no-start fields, which only make Maya more careful (the safety guidance, a close, a confirmation, the easier example).

Three rules of the controller go with it. A checked right answer on the child's question shows they have started: a no-start no longer holds, and the easier example does not start after it. Writing that ends after the answer is solved is the child writing it (`wrote`): the request to write is no longer offered, and neither is it after the reading `paper` was accepted. The final step after the last column ("result") has its own help line, an H0 invite to put the whole answer together (`step.invite` with the step `result`).

## Free talk (D-197)

With `freeTalk` on (the admin demo, the practice suite, this command line), the model may write its own words (`{ "talk": ... }`) in a turn with no math line. Math, answers, hints and steps never come from them. Each piece is said only when both checks pass:

1. The code guards (`freeTalkProblem`, `src/lib/maya/phrases.ts`): an allowed opener, no request, no math, no work word, no pointing back, at most three short sentences (`FREE_TALK_LIMITS`), not the child's name. A few everyday phrases about the conversation pass although a word in them is on a list (`SAFE_PHRASES`: "keep secrets", "secrets to share", "you told me", "thanks for sharing", "you shared it", "right here", "feel that way"), and "I want to" or "I don't want to" is a statement, not a request. The word alone stays refused ("Keep going.", "I told you.", "Share them.", "That's right!").
2. The review (`src/lib/maya-talk-review.ts`): a separate small AI call (`MAYA_REVIEW_MODEL`, default Claude Haiku 5.5) that judges the line against `NEVER_SAY` (`src/lib/maya/talk-review.ts`): what Maya must never say to a child. It reads the line, the child's last turn and the last turns of the call. A failed call, a time-out (8 seconds) or an answer outside its schema counts as a fail. Brief empathy that names what the child told ("I'm sorry your grandma is sick. That sounds really hard.") passes; asking more about it fails. "A grown-up you trust can help", naming no person, passes only for a child who says they are sad, worried, scared or unsafe; to any other child, or with a named person, it fails (`NOT_OK_TALK`). Check the review with `npm run maya:practice -- --anthropic --review-check`: each `NEVER_SAY` and `NOT_OK_TALK` line must fail and each `OK_TALK` line must pass.

The adapter steps the proposal once with no reviews, to learn which words the session would say. It reviews those (in parallel), then steps the proposal again with the reviews. A piece that fails a check, or has no review, is replaced by a bank phrase of the same purpose (for small talk, a reply that fits any child turn: `FEELING_SMALLTALK` when the child's turn tells a hard feeling, such as "Aw, it sounds hard. I'm glad you told me.", else `NEUTRAL_SMALLTALK`, such as "Thanks for telling me."; neither names a detail of what the child said); the turn never fails for it. A refused proposal (free talk beside a math line, for example) is never reviewed.

The model ends a free-talk reply with a phrase from the `back` group ("Shall we get back to our question?"), code-written and with no math, so the reply also leads back to the question; the next turn restates it with a line. Maya confirms what she heard at most twice in a row, and never after the answer is accepted. An echo frame never repeats an insult ("dumb", "stupid" ...): code picks a frame with no slot. The easier example starts with its intro line (`example.intro`) in the turn of its first step; a first step without it is refused.

A request for sexual, violent or other harmful content (`reading.unsafeRequest`) gets the decline line `redirect.decline` ("I can't talk about this. I'm here to help with math.", planned wording that Savar approves separately) and no free talk, then the question again.

Board commands do not change with free talk: Maya draws only through code's board offers (`draw`). Only the board core's tests read the model's own commands (`modelBoard`).

For children's calls, free talk follows one setting: `MAYA_FREE_TALK` (`src/lib/maya-free-talk.ts`, on unless it is `off`).

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
