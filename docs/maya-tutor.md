# Maya's tutor core (D-345)

Maya is the tutor, and code is the safety net. Savar approved this design on 2026-11-14, after his production voice call `c1c7b3d0` showed that the controller's teaching rules made Maya "not a tutor".

## One turn

1. The child speaks.
2. Code builds the tutor brief (`tutorBrief`, `src/lib/maya/tutor-prompt.ts`):
   - the question and every step with its computed value and reason (`stepFacts`);
   - the steps the child has done, and whether the right answer stands;
   - code's verdict on every number and equation in the child's turn, with the likely mistake (`childFacts`, `numberMeaning`);
   - the last turns, the grade, the `{name}` token and how much help Maya gave since the child's last progress;
   - what the board already shows.
3. ONE model call (`TUTOR_PROMPT`, `TUTOR_OUTPUT_SCHEMA`) returns ONE message, a reading and optional board requests.
4. Code checks the whole message once (`checkTutorSay`, `src/lib/maya/tutor.ts`).
5. The message is shown or spoken. Then Maya waits for the child. Always.

## What code checks

| Check | Where | On failure |
|---|---|---|
| Never-say patterns (secrecy, personal questions, claims to see, promises, unkind words, feelings) | `neverSayProblem` in `say-check.ts` | Refused |
| Every equation true, and no true equation called false | `equationsOf` and `equationHolds` | Refused |
| Every relation of numbers and place quantities, in digits or words, chained or not ("1 ten is 10 ones", "52 is four tens and two ones", "12 − 8 = 4 = 5"); an "=" code cannot read | `falseClaims` (`tutor-math.ts`) | Refused |
| Trades ("2 ones become 12", "5 tens became 4 tens") | `placeValueProblem` | Refused |
| No "yes" or "right" for a wrong answer (or for a false equation the child said), no "not quite" for a right one, in any sentence: the stance comes from code's own read of the child's committed answer and its credit (D-340), never only from the model's reading | `checkTutorSay` with the stance | Refused |
| At most 60 words (`TUTOR_WORD_LIMIT`) | `checkTutorSay` | Refused; code never trims |
| A close only after the child solved the question, and never on a turn that asks for help (a stop and the time limit stay code's) | `proposeTutor` in `session.ts` | Refused |
| Child safety of each sentence that is not plain teaching (`plainTeaching`): safety rules only (`TUTOR_REVIEW_SYSTEM`) | the talk review in the adapter, per sentence | Refused |

A refused message gets one repair with the reason, also in voice. A second refusal gets code's honest line with the step's question (`tutorFallbackText`), for example "Let me say that another way. What do you get for 12 minus 8?". A refused board drawing is never a reason to lose the words.

Code still owns, unchanged: safety guidance and its close, the AI disclosure opening, the held close, the stop and time closes, confirmations of a number it could not hear, outside-work redirects, the spend block and the `{name}` token. Those turns go through the controller as before (`tutorTeachingNow` is false for them). Other-topic talk ("What is your favorite animal?") is the tutor's to answer, with the safety review; outside math work, another person's work and an unsafe request stay code's redirect. A turn a gate takes after the model's reading gets code's line at once, with no repair.

## Plain teaching and the review

A sentence is plain teaching (`plainTeaching`) when every word is a math or plain teaching word (`MATH_VOCAB` in `math-vocab.ts`, `TUTOR_MATH_WORDS`, or the question's own words), and it is not a statement about the child or about Maya without a number in it ("You can't do this" is reviewed; "You can't take 8 from 2" is plain). An exact safe sentence and the frame "I'm an AI, so I don't have a favorite ..." are plain too. Only the other sentences go to the review. The never-say patterns and the math checks run on every sentence.

## Streaming (voice)

A tutor message streams to the voice sentence by sentence while the model writes (`tutorStreamSentence`):

- a plain teaching sentence goes out as soon as every check passes on the words so far;
- any other sentence is held, alone, while its review runs in parallel; the sentences after it wait behind it, in order;
- a failed check or a refused review stops the stream; the rest waits for the whole message and its whole check;
- a first "yes" streams only when code found the child right or the child said no number; a first "not quite" only when code found the child wrong or no answer the child offered (the last number of each sentence) is a value of the question;
- a safety or stop turn never streams.

Sentences already said stay said. When the whole message is then refused, no repair follows: code adds only its step question after them. Chat does not stream.

Measured on 2026-11-14 with the real model (Sonnet 5.5 and the Haiku review through OpenRouter), `npm run maya:text -- --model openrouter --voice --tutor --real-clock`: Maya's first sentence after the child's turn, in the text adapter (no speech-to-text or voice), across the same 6 inputs:

| Path | First sentence |
|---|---|
| Controller (production now) | 0.9 to 1.3 s on plain math turns; 2.2 to 5 s on others; 10 to 14 s on "teach me 2 minus 8" |
| Tutor core, no stream (#1002) | 2.7 to 4.8 s on every turn |
| Tutor core, streamed | 0.8 to 1.6 s on all 18 turns of 3 runs, with no override |

The answer rule is lifted: no check blocks a true step value or the answer. Telling is a teaching choice for the prompt.

## Board drawings

The model asks by id; code builds every command from the checked steps (`tutorDrawings`):

- `trade`: the next trade (a borrow in the top row for subtraction, the carried 1 for addition);
- `digit` with a place: an answer digit, after the trade it needs;
- `note` with an equation: one true equation of numbers below the question. Code rebuilds the text from the values; a note with any other text is not drawn.

## Trace

`counts.overrides` counts Maya turns where code changed the model's first words (a refusal, a fallback or a dropped sentence); the target is under 5% of Maya turns. `counts.longestMayaRun` is the longest run of Maya turns with no child turn (target 1). `counts.dropped` counts sentences the controller's review dropped.

## Scope

Phase 1: 2-digit whole-number addition and subtraction (`isTutorQuestion`), on admin test calls only (`tutor: record.kind === "admin_test"` in `src/lib/maya-call.ts`), in chat and voice. Family calls keep the controller. The family switches stay off.

Phase 2 moves every Book 1 question type to the tutor core, and deletes the controller's teaching code as each type moves. Phase 3 rebuilds the practice judge (T01 to T10 plus the trace metrics) and continues the latency work on the single call.
