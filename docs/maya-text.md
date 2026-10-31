# Maya text sessions and the trace format (#322)

A text session runs Maya on one question with text in and text out: no room, no audio. The voice agent (#326), the test bench (#323) and the admin demo (#324) build on it.

## Run one

```sh
npm run maya:text -- --list
npm run maya:text -- --question add-27-39 --script scripts/maya-text/no-start.txt
npm run maya:text -- --question subtract-83-46            # type the child's turns
npm run maya:text -- --question my-package.json --model openrouter
```

| Option | Meaning |
|---|---|
| `--question <id\|file>` | A sample id (`--list`) or a question package JSON file. Default `add-27-39`. |
| `--model fake\|openrouter` | `fake` (default): a rule player, no AI. `openrouter`: `AI_MODEL` through OpenRouter. It needs `OPENROUTER_API_KEY` in the environment or in `.env.local`. Without the key the AI is off and the command stops. |
| `--script <file>` | Child turns, one per line. Without it, turns come from stdin. |
| `--runner livekit\|plain` | `livekit` (default): LiveKit Agents for Node in text mode, with no room. `plain`: the text adapter alone. |
| `--trace <file>` | The trace path. Default `traces/maya/<call id>.json` (not committed). |
| `--seed <n>`, `--name <name>` | The wording seed and the child's name. |

Script lines: a child turn, `/wait <seconds>` (the clock moves on and the pause policy runs), `/write start`, `/write done`, `/quit`. `#` starts a comment. A script or piped input uses a simulated clock (4 seconds a turn, plus each `/wait`). Typed input uses the real clock.

`OPENROUTER_API_KEY` is a Vercel Secret variable, so `vercel env pull` cannot read its value. Put the key in your shell for a real-model run.

## What reaches the child

Nothing reaches the child unless the session's `step` accepts it (`src/lib/maya-text.ts`):

1. The model gets the session's offers for this turn: the allowed acts, their code-written lines, the warm groups with their phrases, and the board offers. It returns a version 2 proposal (`src/lib/maya-model.ts`, prompt `PROMPT_VERSION`).
2. `step` checks the proposal. The board core (`applyBatch`) then checks each board batch the session builds from it.
3. If either refuses, the model is asked again once, with the refusal's code and reason.
4. If the second proposal is refused too, or the model fails, code replaces it with a fallback. A fallback is a code line or a bank phrase from the session's own offers, with no reading and no board, and `step` checks it.
5. If no fallback is accepted, the call ends as a technical issue and Maya says nothing.

`freeTalk` stays off.

## The trace

`src/lib/maya-trace.ts`, `TRACE_VERSION` 1. Read a saved trace with `checkTrace`. A trace holds:

- `model`: the model id and the prompt version. `versions`: the proposal, line set and session versions.
- `question`: the package id, ref, text and `hash` (`sha256:` of its canonical JSON).
- `turns`: start, child, tick, writing, technical and Maya turns. A Maya turn holds the state before and after, every attempt (`model`, `repair`, `fallback`) with its proposal and refusal or error, and the `output` that reached the child.
- `board`: every batch sent, with its turn and commands.
- `outcome`, and `counts` (refusals, repairs, fallbacks, model errors, silent turns). The bench takes its counts again from `turns`.

`checkTrace` checks every field and every nested record: types, enums, the 64-hex hash, the board links and the counts against the turns. It returns the path of the first bad field.

**Every session ends with a trace.** Call `finish()` in a `finally`. If the call has not ended, `finish()` ends it as a technical issue, and starts it first if it never started. An input that throws also ends the call before the error goes on. The command line (`src/lib/maya-text-run.ts`) writes the trace even when the script cannot be read, or when LiveKit does not start or close.

**Errors.** A trace never stores an error's own text. A provider's or a model's message can hold a key in any form, so the trace keeps only a code from `ERROR_MESSAGES` (`http_401`, `http_429`, `http_5xx`, `timeout`, `network`, `bad_json`, `schema_invalid`, `refused_by_provider`, `local`, `unknown`, and others), that code's fixed message, and the HTTP status. `checkTrace` refuses any other code, message or field. The raw text goes only to the `onError` hook; the command line prints it to stderr.

**Child data.** The trace writes the child's profile name as `{name}`. As a second layer, the text fields (child turns, proposals, refusal reasons, technical details) also have key-like text and the configured key values written as `[secret]`. Child turns are kept word for word otherwise, so keep traces local; `traces/` is not committed.

Samples: `docs/maya-traces/`. A test checks each sample with `checkTrace`.
