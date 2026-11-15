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
| No "yes" or "right" for a wrong answer, no "not quite" for a right one, in any sentence: the stance comes from code's own read of the child's committed answer and its credit (D-340), never only from the model's reading | `checkTutorSay` with the stance | Refused |
| At most 60 words (`TUTOR_WORD_LIMIT`) | `checkTutorSay` | Refused; code never trims |
| A close only after the child solved the question, and never on a turn that asks for help (a stop and the time limit stay code's) | `proposeTutor` in `session.ts` | Refused |
| Child safety of any sentence that is not plain math: the whole message, safety rules only (`TUTOR_REVIEW_SYSTEM`) | the talk review in the adapter | Refused |

A refused message gets one repair with the reason, also in voice. A second refusal gets code's honest line with the step's question (`tutorFallbackText`), for example "Let me say that another way. What do you get for 12 minus 8?". A refused board drawing is never a reason to lose the words.

Code still owns, unchanged: safety guidance and its close, the AI disclosure opening, the held close, the stop and time closes, confirmations of a number it could not hear, outside-work redirects, the spend block and the `{name}` token. Those turns go through the controller as before (`tutorTeachingNow` is false for them).

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

Phase 2 moves every Book 1 question type to the tutor core, and deletes the controller's teaching code as each type moves. Phase 3 rebuilds the practice judge (T01 to T10 plus the trace metrics) and brings prepared replies to the single call. A tutor call prepares no reply yet, and a tutor message does not stream: it is said after its whole-message check.
