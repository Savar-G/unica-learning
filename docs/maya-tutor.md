# Maya's tutor core (D-345)

Maya is the tutor, and code is the safety net. Savar approved this design on 2026-11-14, after his production voice call `c1c7b3d0` showed that the controller's teaching rules made Maya "not a tutor".

## One turn

1. The child speaks.
2. Code builds the tutor brief (`tutorBrief`, `src/lib/maya/tutor-prompt.ts`):
   - the question and every step with its computed value and reason (`stepFacts`);
   - the steps the child has done, and whether the right answer stands;
   - code's verdict on every number and equation in the child's turn, with the likely mistake (`childFacts`, `numberMeaning`);
   - the last turns, the grade, the `{name}` token and how much help Maya gave since the child's last progress;
   - what the board already shows (`drawn`), and what was sent with no word from the child's screen yet (`sent`, B1 below).
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
| Comparisons ("12 is 4 more than 8", "4 is greater than 8"), brackets, compound number words ("one hundred and two"), spoken fractions ("five sixths"), objects with a stated size ("4 sticks of ten"), "which is" after a quantity and the value of a digit in a named number; a comparison or bracket code cannot read whole, and a decimal relation, are refused (pre-launch review B) | `falseClaims` (`tutor-math.ts`) | Refused |
| "The answer is ...": the whole value (words, decimals, expressions) and its "not"; a value code cannot read | `answerProblems` (`tutor-math.ts`) | Refused |
| No correctness judgment against code's stance, in any sentence: any judgment word (right, correct, true, yes, exactly, perfect, great job, well done, nice, spot on, got it, nailed, and the negatives wrong, incorrect, false, not quite, nope) makes a sentence a judgment (`judgment` in `tutor.ts`). With stance "wrong" a positive one is refused, with stance "right" a negative one. The stance comes from code's own read of the child's committed answer and its credit (D-340), never only from the model's reading | `checkTutorSay` and the stream, with the stance | Refused |
| At most 60 words (`TUTOR_WORD_LIMIT`) | `checkTutorSay` | Refused; code never trims |
| A close only after the child solved the question, and never on a turn that asks for help (a stop and the time limit stay code's) | `proposeTutor` in `session.ts` | Refused |
| Child safety of each sentence that is not plain teaching (`plainTeaching`): safety rules only (`TUTOR_REVIEW_SYSTEM`). A judgment is never plain teaching, and the review's refusal of a judgment is binding, whatever rules it names (`bindingReview`) | the talk review in the adapter, per sentence | Refused |
| True math of each sentence that is no exact match (`codeAlone`, below): the math-truth review with code's facts | the math review in the adapter, per sentence (below) | Refused |

## Two-layer true math (2026-11-15)

Each review round of the claim reader found new false sentences next to the last fix ("The answer is 24 and a half" read as 24; "4, which is greater than 8"; "One and a half is one half"). Patching phrasings does not end. The Chief of Staff's design has two layers:

1. **Code alone.** Replaced by the exact-match rule below (2026-11-15). Before it: a sentence passed on code alone when the claim reader accounted for every number (digits, number words, fractions, "and a half", a remainder, mixed numbers) and every relation word (is, are, equals, makes, becomes, which is, that is, so after a number, greater, less, more, than, same) inside a claim it checked and found true (`readClaims` in `tutor-math.ts`, `unreadMath` in `tutor.ts`). A closed question form ("What is 12 minus 8?") claims nothing, but only in a question; the fixed true trade ("Trade 1 ten for 10 ones") and a place named alone claim nothing; an answer claim read whole and true is read. A word quantity such as "one hundred and two tens" (120 or 1,020) is never read as covered. A false claim code finds is refused as before: one repair, then code's honest line.
2. **The math-truth review.** A sentence with no found problem that code did not read whole is not refused. It goes to one small model call (`src/lib/maya-math-review.ts`, `MAYA_MATH_REVIEW_MODEL`, default `anthropic/claude-haiku-5.5`, Maya's OpenRouter key) with the sentence, Maya's sentences before it, the question, the steps with their results, the work values, the answer, code's verdicts on the child's numbers this turn and the last 4 turns (`mathReviewInput`, the child's name hidden; the contract is `src/lib/maya/math-review.ts`). It answers strict JSON `{verdict: "true" | "false" | "unsure", reason}`. Only "true" lets the sentence be said. "false", "unsure", an error, a time-out (the talk review's limit) or JSON outside the schema means one repair with the reason, then code's honest line. Without a math reviewer (no key) such a sentence is refused.

   Version 3 of the review (`maya-math-review-3`, 2026-11-15). In real right-answer and "teach me" turns the review called true sentences "unsure" or "false" ("Now there are 12 ones.", "You traded a ten for 10 ones, I think."), and a streamed voice message gets no repair. Three changes:
   - **Code's facts per step.** The input holds `stepStates` (`src/lib/maya/math-review-steps.ts`): for each step of the kind, its operation, operands, value and the state of the work after it, in plain words code writes from the package's computed steps only ("after the trade, 52 is 4 tens and 12 ones; ones done: 12 ones minus 8 ones is 4 ones; write 4 in the ones"; "tens: the carried 1 + 2 + 3 = 6 tens"; a product's rows; a digit and its value; a claim's comparison). `start` holds the printed numbers in places. The easier example has its own `stepStates`. Never the model's or the child's words, and the child's name is hidden.
   - **One retry of "unsure".** An "unsure" answer of the first review goes once to `MAYA_MATH_REVIEW_RETRY_MODEL` (default `anthropic/claude-sonnet-5.5`, same key) with the same input, inside the same time limit. Only the retry's "true" passes; its "false", "unsure", an error or a time-out is final, and a late answer changes nothing. A verdict that its own reason contradicts ("true", then "labeling it as the tens step is wrong"; "false", then "re-check: this is true") is read as "unsure", so it goes to the retry. Since final check 8 (2026-11-15) there is no second ask of an answer that is not JSON: see below. The trace marks a retried review (`attempts[].math[].retried`, `counts.mathRetries`, `mathReviewer.retryId`); the retry counts in Maya's spend as a review attempt.
   - **Strict output and more thinking.** The schema has no length bound (a bound turned off Claude's strict JSON, and Sonnet wrote its working before the JSON); the reader cuts a long reason. The first review runs at effort "medium": at "low" it judged 1 or 2 of #1056's 124 false sentences true in 3 of 5 runs.

Pre-launch check 2 (2026-11-15) closed two gaps of layer 1. A column sum said in a place ("1 + 2 + 3 = 6 tens") is read whole only when it is one of the question's own column sums in that column's place (`columnSums` in `tutor.ts`); any other ("1 plus 2 plus 3 is 6 hundreds" in 52 − 28) goes to the review. And every word after a read claim, to the end of its clause, must be a plain link word: "12 minus 8 is 4 with a negative sign" and "12 minus 8 is 4 in the hundreds place" go to the review. The math review's step facts hide the child's name too, as its question does.

The kinds' own checks (`claimProblems`) still refuse. A sentence only a kind reads ("the digit in the hundreds place is 2") is not core-covered: it goes to the review. The talk review is unchanged; a sentence may need both reviews, both run in parallel and both must pass. In the stream, a covered sentence goes out at once; an uncovered one is held, alone, while its reviews run, and the sentences after it wait. Admin test calls and family calls (`MAYA_TUTOR_FAMILIES`) both use it; the controller path is unchanged. Each review is kept in the trace (version 12: `attempts[].math`, `mathReviewer`, `counts.mathReviews`, `counts.mathRefusals`). Its attempts count in Maya's spend as review attempts (`docs/maya-spend.md`).

Measured on 2026-11-15 (base `aa4eef2c0`):

| Set | Passes on code alone | Goes to the review | Refused by code |
|---|---|---|---|
| The 515 accepted real sentences of 2026-11-14 (`tutor-corpus-20261114.json`) | 133 (25.8%) | 382 (74.2%) | 0 (0%) |
| Code's step texts of the Book 1 census (567 tutor questions, 1,573 sentences) | 49 (3.1%) | 1,524 (96.9%) | 0 (0%) |
| Code's step questions of the census (code's honest line, 1,397) | 1,386 (99.2%) | 11 (0.8%) | 0 (0%) |

- No true sentence of either set is refused by code (false refusals of layer 1: 0 of 515, 0 of 1,573).
- Before this change only 35 of the 515 corpus sentences were plain teaching (said with no review). 31 of them still pass on code alone; the other 4 ("Write 4 in the ones place") now wait for the math review. The other 378 sentences that go to the math review are not plain teaching, so they already waited for the talk review, which runs beside it.
- The step texts go to the review mostly for an instruction number ("write 4 in the ones", "carry 1"), a kind-only claim ("the digit in the hundreds place is 2") or a list of place names. Reading these in code is the next coverage work.
- The first sentence of a plain message is unchanged: 1 to 2 ms of code time on both heads in the text adapter with an 800 ms review (a covered sentence takes no review).

The false sentences of the Sol rounds (`/tmp/prelaunch-b`, `/tmp/final-2` survey, matrix and confirmed cases; 116 distinct, not counting the fit findings, which are sentence-true and belong to the fit checks): 50 are refused by code, 66 go to the review, 0 pass on code alone. The real review (Haiku 5.5, `low` effort) judged all 66 "false" (USD 0.014 for the run, median 0.8 s per call). On 20 true controls from the corpus it judged 16 "true"; of the 4 others, 2 need the child's earlier words, which the corpus does not keep, and 2 were call errors (`bad_json`), which count as "unsure". With `minimal` effort the verdicts were worse (the review said "false" while it explained the math was true), so the request uses `low`.

### A reliable review and a verifiable first sentence (2026-11-15)

- **No second ask after bad JSON (changed by final check 8).** #1057 asked an answer that is not JSON (`bad_json`) again once. Since final check 8 (2026-11-15, the Chief of Staff's rule) a malformed review answer (not JSON, outside the schema, a verdict that is not "true", "false" or "unsure") is a final "unsure" for that sentence: no second call of any kind, to the same model or to the retry, and the text adapter does not review the same sentence again in the same child turn, not even in the repair (`fromMalformedAnswer`). Only a well-formed "unsure" goes to the Sonnet retry. A time-out and every other error are not asked again.
- **The last 2 turns and the easier example.** The review input (version `maya-math-review-2`) holds `lastTurns`: Maya's message before the child's turn and the child's turn she answers, as code holds them, with the child's name as `{name}`. A sentence that points back ("That's 8 minus 2, the other way around") is read against them. It also holds `easierExample`, code's steps and answer of the question's easier example, which Maya may teach first ("Write 3 in the tens place" is true in 42 − 7 and false in 52 − 28). The instructions say that a sentence true at one moment of the work or of the easier example is true unless the call shows another moment, and that a word quantity with two readings ("one hundred and three tens") is "unsure".
- **The first sentence.** The tutor prompt (`maya-tutor-4`) tells the model to open a "math" or "help" message with one sentence code checks alone: a true equation of the question's numbers ("52 is 4 tens and 12 ones."), the child's wrong number back ("52 minus 28 isn't 36."), the question with its answer when the child is right, or a plain question ("What is 2 minus 8?"). The child hears it at once while the reviews of the next sentences run. The rule never comes before safety or the AI disclosure: on "offtopic", "stop", "safety", "other" or a question about Maya, the message starts with the answer to the child. The bare expression "52 minus 28." is not read by code today, so the prompt does not offer it.

Measured on 2026-11-15 on base `5d9ad5448` (real review, Haiku 5.5, `low` effort, the live 4 s limit; the 66 false sentences of the Sol rounds that reach the review; 20 true corpus controls picked as #1044 picks them, and #1044's own 20):

| Run | False sentences judged "false" | New 20 controls judged "true" | #1044's 20 controls judged "true" |
|---|---|---|---|
| #1044 (`f471900d2`, 8 s limit) | 66 of 66 | - | 16 of 20 |
| This change, run 1 | 66 of 66 | 19 of 20 | 17 of 20 |
| This change, run 2 | 66 of 66 | 19 of 20 | 19 of 20 |

Each miss is a "false" whose own reason finds the math true ("12 is how many ones we have after the trade: 2 + 10.", "Now the number is still 52, just split a new way."). Code never turns a "false" into a pass: the sentence gets a repair. With the reason written before the verdict the controls were 20 of 20, but 1 to 4 false sentences were judged "true" ("One hundred and three tens is 130."), so the verdict stays first. The two controls that need the child's words got a child turn rebuilt from the sentence ("I got 56.", "I got 36."), because the corpus keeps none. One run met a `bad_json` answer: the second ask answered.

First sentence, real Maya model (`anthropic/claude-sonnet-5.5`), real talk and math reviews, 52 − 28, 5 turns (right answer, wrong answer, "teach me", off-topic, help request), 3 runs each:

| | First sentence on code alone | Median time to the first sentence |
|---|---|---|
| Before (`5d9ad5448`) | 0 of 15 | 1,835 ms (math and help turns: 1,875 ms) |
| After | 12 of 15 (12 of 12 math and help turns, 0 of 3 off-topic) | 903 ms (math and help turns: 854 ms) |

On every off-topic turn, before and after, the message starts with "I'm an AI". Before, 2 of 15 turns ended in code's fallback line; after, none.

### The exact-match rule (2026-11-15)

Every Sol round found new false sentences that the claim reader passed on code alone ("24 is the answer with a negative sign.", "12 minus 8 is 4, with a negative sign."). The Chief of Staff's decision: code alone grants a pass only to an exact match, never to coverage.

- **Code alone** (`codeAlone` in `tutor.ts`) passes a sentence only when the whole sentence (`exactKey`: trimmed, one final ".", "!" or "?" removed, plain apostrophes and minus signs, lower case) is:
  1. one of code's own texts for this question (`exactTexts`): each step's work text (`TutorKind.steps`) sentence by sentence, each part of it between ";" or ":" (each part is code's own true statement of this question, such as "write 4 in the ones"), and the step question after each number of done steps (`TutorKind.stepQuestion`); or
  2. one closed plain form, as the whole sentence: an equation or place-value claim of numbers (`ASSERT_FORM`: "12 minus 8 is 4.", "52 is 4 tens and 12 ones.", "52 minus 28 isn't 36.") in which code read every number and relation inside a claim it found true; or a closed question form ("What is 12 minus 8?"), only in a question. Since final check 5 an instruction (a trade, an operation on a place) is code alone only as an exact text of the active problem.

  No lead-in ("Now", "Okay"), no `{name}` and no other word: no closed form allows one. The true-math checks of `checkTutorSay` still run on every sentence.
- **The claim reader only refuses.** `falseClaims`, `answerProblems` and the kinds' `claimProblems` still refuse a claim they find false (one repair, then code's line). An empty `unreadMath` no longer grants a pass; it is only one more condition of a closed form. Every sentence that is no exact match goes to the math-truth review, also a sentence with no number ("Let's start with the ones."), beside the talk review when that runs.
- "52 minus 28 is the answer." (final check 3, P2) was refused by `answerProblems`, which read it as "28 is the answer". A number after an operation word ("minus", "plus", "times", "by", "away", "over", "x") or a sign is now not read as the subject: code neither refuses nor reads it, so the sentence goes to the math review.
- The prompt's first-sentence rule (`maya-tutor-5`) asks for the sentence as a whole closed form with no word before it. A test checks that every example in the rule passes on code alone.

Measured on 2026-11-15 on base `16fde3a7a` with this change:

| Set | Passes on code alone | Goes to the review | Refused by code |
|---|---|---|---|
| The 515 accepted real sentences of 2026-11-14 (`tutor-corpus-20261114.json`) | 21 (4.1%; was 133, 25.8%) | 494 (95.9%) | 0 (0%) |
| Code's step texts of the Book 1 census (567 tutor questions, 1,573 sentences) | 1,573 (100%; was 49, 3.1%) | 0 | 0 |
| Code's step questions of the census, after each number of done steps (1,589) | 1,589 (100%) | 0 | 0 |

- False refusals of layer 1: 0 of 515 and 0 of 1,573.
- The 124 distinct false sentences of the Sol rounds and the pre-launch checks (`src/lib/maya/__fixtures__/tutor-false-sentences-20261115.json`) pass on code alone in none of 7 tutor packages (52 − 28, 27 + 39, a claim, place value, fractions, 1340 ÷ 2, 6 × 440): each is refused or held for the review (`src/lib/maya-text-exact-match.test.ts`).

First sentence, real Maya model (`anthropic/claude-sonnet-5.5`), real talk and math reviews (Haiku 5.5), the voice stream on (`onSayPart` in the text adapter, no speech-to-text or voice), 52 − 28, 3 runs of each turn:

| Turn | Median first sentence | Median whole message | First sentence on code alone |
|---|---|---|---|
| Right answer ("It's 24.") | 1,119 ms | 3,263 ms | 3 of 3 |
| Wrong answer ("It's 36.") | 864 ms | 4,916 ms | 3 of 3 |
| "Can you teach me how to do this?" | 886 ms | 2,898 ms | 3 of 3 |
| Off-topic ("What is your favorite animal?") | 2,774 ms | 2,774 ms | 0 of 3 (starts with "I'm an AI") |
| Help request ("I need help.") | 899 ms | 3,266 ms | 3 of 3 |

- Median of the 12 math and help turns: 893 ms (#1046: 854 ms). The off-topic turn's first sentence waits for its talk and math reviews.
- More sentences now wait for the math review, so a "false" or "unsure" verdict on a true sentence happens more often. In the 15 turns above: no fallback on a math or help turn, and 1 repair on an off-topic turn (a talk review refusal). In 10 more right and teach turns (two trial runs and a check run), 4 ended in code's line after the first sentence. In the check run, each was a math review "unsure" or "false" on a true sentence about the child's work or the board ("You traded a ten for 10 ones, I think.", "Now there are 12 ones."). In voice a streamed message gets no repair, so code says its step question.

### Final check 3 (2026-11-15)

- **A turn with any identity word streams nothing.** "Am I speaking to somebody real?" and "Is your voice a real person?" are no `asksIdentity` form, so two math sentences streamed before the disclosure the model's reading asked for. Now any identity word in the child's turn (real, person, people, human, somebody, someone, AI, robot, bot, computer, machine, alive, live person, actual, who are you, what are you; `mayAskIdentity` in `identity.ts`) holds every sentence of the turn (`tutorStream` and `streamPlan` return null). When the reading or code's reader says identity, the exact `about.ai` line goes first; else the held sentences go out with the whole message. Over-holding costs only speed.
- **Only a committed right answer keeps Maya's answer from counting as given.** "I have 24 crayons. Help me with this question." counted as the child having said 24, so Maya's "52 minus 28 is 24." was saved as a small hint. Now `tellsAnswer` takes `committedRight`: a right final answer the child committed to (the committed read the stance uses, or a result that stood), or code's right word on a word question. Any help word in the turn (help, stuck, teach, explain, show me, don't know, don't get, don't understand) commits nothing unless the child names the answer ("My answer is 24."), and Maya's help is recorded whenever the child has no committed right answer.
- **Any judgment follows code's stance.** After "My answer is 36.", "You have the correct answer.", "Perfect!" and "You nailed it!" reached the child, and a talk review that refused one for "math" was ignored. Now the judgment reader refuses them, in the whole message and in the stream, and a judgment always goes to the talk review, whose refusal is binding.

### Final check 5 (2026-11-15)

- **The reading comes before speech.** The tutor output writes `kind`, then `reading`, then `say` (`TUTOR_OUTPUT_SCHEMA`, prompt `maya-tutor-6`). The stream reads the reading whole before it sends any sentence (`partialSay` reads the keys before `say`; `tutorStreamReading` in `session.ts`). A reading about Maya, safety, a stop, an unsafe request, other-topic talk, work outside the question, or one a priority gate takes holds the whole message, so code's own line goes first, as when the stream is off. A `say` that begins before a complete reading (a model that ignores the order) streams nothing on that turn. Code's identity reader (`mayAskIdentity`) stays as an extra guard.
- **Answer given by places or by a leading word.** Before the child committed the right answer, a message of Maya's gives the answer when it names every digit of the answer in its place, in any order, in digits or words ("Write 2 in the tens place and 4 in the ones place", "2 tens and 4 ones"; `placeDigitsSaid` in `tutor-math.ts`), or names the answer word of a word question without the other choice word, a question too ("Do you agree the answer is true?"). A place quantity that makes up another number of the question ("28 is 2 tens and 8 ones") names no answer digit. The record is `answer_given`.
- **The math review owns correctness judgments** (`maya-math-review-4`; final check 6 adds "unknown", version 5). Its input holds `childAnswer`: code's verdict on the answer the child committed this turn (value, "right" or "wrong", the right answer). Its prompt makes any sentence that says or implies the child's answer or work is right "false" when the verdict is wrong, and the reverse. Praise of effort is true with either verdict. A "true" verdict's reason is exactly "all true", so the contradiction reader does not read a repeated verdict on the child's answer as a fault.
- **The easier example in play.** Once the easier example is named ("easier", "example"), a number only it has is said, or code introduced or showed it, no step text passes on code alone for the rest of the call, for either problem (`tutorTexts`).
- **Safe intermediates.** Every intermediate value of a side must be a safe integer; else the side is not read, neither true nor false, and goes to the review.
- **A malformed review answer is final.** An answer outside the schema (not an object, an unknown verdict, an extra field) is a final "unsure"; only a well-formed "unsure" goes to the retry.
- **", and" is read two ways.** Code refuses only when both reads (one quantity, or a new clause) find a problem, and passes a claim only when both agree; else the sentence goes to the review.
- **The easier example's facts when no kind fits it.** The review input keeps its text, answer and computed steps when no tutor kind fits it (0 × 1 for 6 × 440).

Measured on 2026-11-15 (real Maya model `anthropic/claude-sonnet-5.5`, real reviews, 52 − 28):

- The model wrote `reading` before `say` in 14 of 14 turns that reached `say` (math, help, identity, off-topic). One more turn ("What is your favorite animal?") ran out the 6 s turn budget before `say`, on the base head too.
- First sentence on the 5 math and help turns: median 1,165 ms before (`dd1aafb1e`), 1,815 ms after. The reading costs about 650 ms before the first sentence.
- The math review (Haiku 5.5, Sonnet 5.5 retry, 4 s limit), after "My answer is 36.": 30 judgments that the answer is right refused in 3 of 3 runs; of 30 true sentences (corrections, encouragement), 1, 1 and 0 refused. On the base head 27 of 30 judgments were refused. The 75 column false sentences of the fixture: 0 said, before and after.

### The gate field (2026-11-15, after final check 5)

Writing the whole reading before `say` added about 650 ms before the first sentence. The tutor output now writes a small `gate` first, then `kind`, `say`, `act`, and the rest of the reading after `say` (`TUTOR_OUTPUT_SCHEMA`, prompt `maya-tutor-7`).

- **The gate.** `gate` is "none", "identity" (a question about Maya), "safety" (harm, danger or a harmful request) or "stop". The stream sends no sentence before the gate is complete. Any value but "none" holds the whole turn, and code's own line goes first. A `say` written before the gate streams nothing on that turn. Only `gate` then `kind` may come before `say`.
- **Code's own read is the second guard.** The stream starts only on a turn code read as plainly math, with no identity word, no safety and no stop (`tutorStream`, `plainlyMathTurn`). Every other turn waits for the whole message.
- **The gate is a priority reading.** A gate flag counts even when the reading after `say` does not repeat it (`priorityOf`): "identity" makes the disclosure due, "safety" raises a concern (a harmful request keeps the decline), "stop" closes.
- **The full reading still decides the rest.** Credit, stance and the priority readings that are not gate flags come from the reading after `say`, as before. When that reading holds the turn (`tutorStreamReading`), no further sentence goes out, and code's line follows the words already said. A gate that disagrees with the reading is recorded on the attempt (`gateDisagrees` in the trace).

Final check 6, part 1 (fail closed):

- **A priority value seen in the stream is kept.** Every version 3 request reads its raw text as it streams in (`streamedPriority`). When the final parse fails, the output repeats a key, or the turn's time ends, any priority value already in the text (a gate, a whole or cut-off reading, kind "safety" or "stop") applies through the normal priority path: the guidance or the disclosure is due, never a return to math. A stale request changes nothing.
- **One gate, one reading.** A key written twice makes the whole output malformed for routing: nothing further streams, the output counts as not valid JSON, and any priority value in any copy applies. The stream and final routing read the same text.

Measured on 2026-11-15 (real Maya model `anthropic/claude-sonnet-5.5`, real talk and math reviews, voice stream on, 52 − 28, 5 math and help turns × 3 runs):

- First sentence: median 1,612 ms before (`b02df0da9`), 1,153 ms after.
- The model wrote `gate` first in 21 of 21 turns.
- Identity and off-topic turns streamed nothing before the model ended, on both heads.

### Final check 6 (2026-11-15)

Rules, not word lists. Each failure found on `b02df0da9` has a binding test in `src/lib/maya/tutor-final6.test.ts` or `src/lib/maya-final-check6.test.ts`.

- **Exact values only.** An operation with a value that is not a whole number (a quotient such as 1 ÷ 10,000,000,000, a fraction in a sum or a product) or that is not a safe integer leaves its side unread: no code-only pass, no "true" and no refusal from code. The sentence goes to the math review. A lone spoken fraction ("five sixths") is still read.
- **A review holds the rest of the message.** A sentence passes on code alone only when every sentence before it in the same message (and in the stream prefix) also passed on code alone. After the first sentence that needs the math review, every later sentence of that message needs it too ("Let us try the easier example. Write 4 in the ones.").
- **Scoped and unread answer claims go to the review.** Code reads "the answer is N" and "N is the answer" only with nothing before them in the sentence but a short lead-in ({name}, now, so, next, then), nothing after the value in its clause, and a value it reads whole as a safe integer. Any other claim ("In the ones column, the answer is 4.", "For the easier example, the answer is 35.", "The answer is about 25.", an unsafe value) is neither refused nor read.
- **The child's verdict is code's validated stance** (`maya-math-review-5`). In order: a false equation in the child's turn is "wrong"; a word answer uses code's word verdict; an explicit answer of the child's own ("My answer is 36.") is read from its own sentence only, never from the turn's last number ("My friend said 24" is not the child's answer), and is "right" only when code also credits it; else "right" only from code's credit and "wrong" only from a whole turn of one number or code's read of a miss. Any other number is "unknown", and the prompt makes a sentence that calls the child's answer right or wrong "false" then.
- **An answer word that rejects the other choice gives the answer.** A sentence of Maya's that names both choice words gives the answer ("The answer is true, not false.", "Circle true instead of false."), unless it is an open choice: the two words joined by "or", each said once, with no negating word ("Is it true or false?", "Is it true, or is it false?").

### Final check 7 (2026-11-15)

Rules, not word lists. Each failure found on `debf17c8e` has a binding test in `src/lib/maya/tutor-final7.test.ts`.

- **Only literal equality is context-free.** Code alone reads a relation only when its two sides have equal values ("52 is 4 tens and 12 ones", "12 minus 8 is 4"). A relation that holds only by reading a bare number in a place ("1 + 2 + 3 = 6 tens") or as a trade depends on which problem and which column it means: it passes on code alone only as an exact step text of the active problem, and any other wording goes to the math review. This replaces the column-sum read of pre-launch check 2.
- **Each operator from its own place.** The child's facts for the review print every operator as the reader read it ("3 × 2 = 6", "8 − 2 + 4 = 10").
- **An expression is read only in full.** A sign or an operator right before or right after an expression ("Minus 6 plus 10 is 4", "negative 6 plus 10", "12 minus 8 is 4 minus") leaves the whole equation unread, in the equation reader and in the claim reader: no verdict from code on the child's turn ("unknown"), and Maya's sentence goes to the review, never a refusal.
- **A pattern clause the kind cannot read in full goes to the review.** Only a clause in one of the pattern forms that does not hold is refused. A question, a negation or any other form is not refused.
- **A repeated key at any depth.** A key written twice in any one object of the output, also inside `reading`, makes the output malformed for routing. Every priority value in any copy applies: the strongest safety level, any identity question, any stop.
- **The disclosure before a scope redirect.** A question about Maya (the gate or the reading) makes the exact `about.ai` line due before any scope redirect; a redirect still due follows it.
- **A statement that names a choice word gives the answer.** On a word-answer question, a sentence of Maya's that is not a question and names any choice word gives the answer ("Circle the first word: true or false."), unless the child already committed the right answer. Only a question that offers the answer word and another choice and picks none ("Is it true or false?") is an open choice.
- **The review's verdict uses the step credit.** "It's N" and "I got N" use code's validated credit of the turn ("It's 4." for the ones of 52 − 28 is "right"). Only an explicit final answer ("my answer is", "the answer is") is compared with the whole answer.

### Final check 8 (2026-11-15)

Rules, not word lists; the defaults are inverted so that a reader that cannot prove a reading fails closed. Each failure found on `f2951bcf4` has a binding test in `src/lib/maya/tutor-final8.test.ts`.

- **The child's reader reads whole clauses.** The equation reader used for the child's words (`childFacts` and the child's verdict for the review: `equationsOf` with `whole`, `childSaysFalse(text, { whole: true })`) reads an equation only when it reads every token of its clause (a clause ends at a comma, ";", ":", ".", "!", or before "because", "so" or "since"). A unit ("3 times 2 is 6 tens"), a scope, an enclosing negation ("It is not true that 3 times 2 is 7"), a leading sign, a question mark or any other word left over leaves the clause unread: no printed fact, verdict "unknown". Only a short lead word (so, now, next, then, and, okay, yes, well) and "the" or "a" may stand in it. The stance that keeps Maya from praising the turn still uses the broad read, which only blocks praise.
- **An enclosing negation or a scope leaves Maya's equation unread.** Maya's equations are refused only when read in their whole clause (`checkTutorSay`), and the claim reader (`readClaims`) leaves a claim unread when, in its clause, a negation, a relation or a word that opens a scope or an embedded clause stands before it, or a word that is not a plain link word stands after it (before a word that starts a new clause). Such a sentence goes to the math review, never a refusal.
- **A comparison or bracket read only in part goes to the review.** A comparison whose base has a sign or runs on ("4 is 6 more than minus 2") and a bracket the reader cannot read whole ("2 times (minus 3 plus 4) is 2") are unread, never refused.
- **A malformed review answer is final.** See "No second ask after bad JSON" above.
- **Every priority value in the raw text applies.** `streamedPriority` reads the priority fields (`gate`, `kind`, `aboutMaya`, `safety`, `stop`, `unsafeRequest`) from the raw model text as `"key": value` pairs wherever they stand: inside an outer Markdown fence, after an invalid value (`"gate": NaN`) or in a cut-off copy (`rawPriorityMembers`). Text inside a JSON string (the `say` text) is one token, so a key written in it is no member. A parsed proposal that does not carry every priority value of its raw text is malformed for routing, and the raw value applies (`priorityCovered`). Over-triggering only adds code's fixed line.
- **The help level is "answer_given" by default.** Before the child committed the right answer, a message of Maya's (any sentence, a question too, or a board note) that holds the answer value in any form (digits or words, also when it is a value of the work: "The answer is 6.", "Write 6 on your paper." on 3 × 2; `namesValue`) or any choice word of a word answer ("Will you circle the first word: true or false?") records `answer_given`. Only a proven open choice is exempt: the whole sentence is one closed question form that offers the answer word and one other choice and picks neither ("Is it true or false?", "True or false?", "Is it true, or is it false?"). "hint" or "guided" is recorded only when code proves the message holds neither. The parent note may say "with help" more often; it never says "a small hint" when the answer was in Maya's words.
- **A number bound to a place is credited only against that place's step** (`boundNumbers`, `scopedMiss` in `session.ts`). A number the child binds to a place, a column, a step or another scope ("I got 24 for the tens.", "My answer for the tens is 24.", "For the tens, I got 24.") is never final-answer credit. A place binds a number after a preposition ("for the tens", "in the ones"), as a unit after a number ("6 tens") or as a place noun ("the tens digit"); a place that is only the subject of narration ("and the tens make 66") binds nothing. Bound to one place, the number is credited only against that place's open step; if it does not equal that step's result, it is wrong for that step: the stance is "wrong" and the review's verdict is "wrong".
- **A validated step credit is "right" in the review.** An unambiguous step credit this turn (one credited step, one value, no false equation) gives the review the verdict "right" for that step before any early return ("I got 4 in the ones." on 52 − 28).

### Final check 9 (2026-11-15)

Rules, not word lists; the defaults are inverted and fail closed. Each failure found on `320b41fe8` has a binding test in `src/lib/maya/tutor-final9.test.ts`.

- **Credit and a "right" verdict need a complete answer read** (`answerReadWhole` in `session.ts`). Every clause of the child's turn that holds a credited number may hold only numbers, operators, answer words ("my answer is", "I got", "so") and the question's own answer unit ("20 books." for "How many books ...?"; a step may also hold place, column and carrying words). Any other word ("20 jars.") leaves the number uncredited, and the review's verdict is "unknown".
- **Number words are read by their groups** (`wordNumbers` in `say-check.ts`). A number is [a group] "thousand" [and] [a group], and a group is [1 to 9 "hundred" [and]] [1 to 99]: "two thousand six hundred and forty" is 2640, "one thousand and five" is 1005. A run of number words that makes no one such value ("two thousand two thousand", "twenty hundred", "and zero") has no value, and its clause is unread.
- **Every terminal math review result that is not "true" is final for its sentence for the rest of the child turn** (`finalMath` in `maya-text.ts`): false, "unsure" after the retry, a malformed answer, an error and a time-out. A repair that says the sentence again is refused, and code's line follows. A new child turn reviews it again.
- **An "=" code cannot read leaves its clause unread** (`tutor-math.ts`): "2 times (minus 3 plus 4) = 2." and "3 squared = 9." go to the math review. Only a complete clause code proves false is refused.
- **Any board command holds Maya's words** (`boardTexts` in `session.ts`). Every text and value of every board command (a put's value, a write's text, a label, any field but its op and ids) is read as her sentences are: a board that shows the answer value or a choice word before the child committed the right answer records `answer_given`.
- **A place, a column, a step, a digit, a row or a part anywhere in the turn binds its numbers** (`turnNamesScope`). A number is final-answer credit only when the child's turn names none of them ("The tens answer is 24." is no final answer). A place word that the question's own text says (a place-value question's place) does not count. The number is still credited against a step only by the step rules above.
- **The easier example scopes the whole turn** (`mentionsExample`). A turn that names the example, the practice one or the other one gives no credit, miss or verdict for the target: code's verdict to the review is "unknown". The example's own steps are credited only through the model's reading with `problem: "example"`.

## Credit, the learning event and the parent note

Code's credit of the child decides the saved result, never the model's reading (part C of the pre-launch review, 2026-11-15; tests: `src/lib/maya-call-tutor-credit.test.ts`, `src/lib/maya/tutor-credit.test.ts`):

- A spot-the-error word before its fix is known is no answer (`spotAnswers`): "I tick no." alone does not solve the question. The right word still sets the stance.
- A clear new final answer that is not right ("My answer is 36.", or a one-sentence answer that is not a value of the work) replaces a right result that stood. A value of the work ("12 minus 8 is 4") keeps it.
- The step the child needed help with is the step open on the first turn where Maya helped and the child made no progress (`stuckStep`), never a step the child had done before.
- A message or board that gives the whole answer (a true equation with the answer as its result, the answer as a number the child has not said, or every answer digit on the board) records `answer_given` before step help is classified as `guided` or `hint`.
- The stream and the whole message use the same word verdict (`wordVerdict`). On a word question (a claim or a comparison), a first "yes" streams only on code's right word.

A refused message gets one repair with the reason, also in voice. A second refusal gets code's honest line with the step's question (`tutorFallbackText`), for example "Let me say that another way. What do you get for 12 minus 8?". A refused board drawing is never a reason to lose the words.

Code still owns, unchanged: safety guidance and its close, the AI disclosure opening, the held close, the stop and time closes, confirmations of a number it could not hear, outside-work redirects, the spend block and the `{name}` token. Those turns go through the controller as before (`tutorTeachingNow` is false for them). Other-topic talk ("What is your favorite animal?") is the tutor's to answer, with the safety review; outside math work, another person's work and an unsafe request stay code's redirect. A turn a gate takes after the model's reading gets code's line at once, with no repair.

## Plain teaching and the review

A sentence is plain teaching (`plainTeaching`) only when it is an exact approved sentence (`EXACT_SAFE`), or when each clause (split at ":", ";" and ","), after a fixed spoken lead-in ("Now", "So", "Not quite", the name), is one of a few complete math forms (`PLAIN_FORMS`): an equation of numbers and places ("12 minus 8 is 4", "52 is 4 tens and 12 ones"), "What is ...?", "How many ones ...?", "What do we write in the tens?", "Write 4 in the ones", "Trade 1 ten for 10 ones", "Subtract the ones" or a bare place. No word list decides it. Every other sentence goes to the review, in parallel with the stream. The never-say patterns and the math checks run on every sentence.

## Streaming (voice)

A tutor message streams to the voice sentence by sentence while the model writes (`tutorStreamSentence`):

- a plain teaching sentence goes out as soon as every check passes on the words so far, and only with this question's numbers and operations (an outside answer such as "4 plus 8 is 12" waits for the whole message and its scope reading);
- any other sentence is held, alone, while its review runs in parallel; the sentences after it wait behind it, in order;
- a failed check or a refused review stops the stream; the rest waits for the whole message and its whole check;
- a first "yes" streams only when code found the child right or the child said no number; a first "not quite" only when code found the child wrong or no answer the child offered (the last number of each sentence) is a value of the question;
- a safety or stop turn never streams, and a content hold, a safety flag or the end of the call stops the stream at once.

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

### Shown means shown (B1)

A drawing counts as on the board only when the child's screen says it showed it. Until then it is "sent".

- When Maya sends a batch, the session keeps its drawing keys in `tutor.drawn` (so nothing is sent twice) and in `tutor.sent` under the batch's transaction id. The brief lists those keys in `sent`, not in `drawn`. The prompt (`maya-tutor-8`) tells the model not to ask for them again and not to say they are on the board.
- The child's screen says what it did with each batch (`board_fate`): `shown`, `skipped` (the board refused it because it would cover the child's ink) or `cancelled` (a voice call stopped it before its cue because the child talked first). Shown: the keys stay in `drawn`. Skipped or cancelled: the keys leave `drawn` and `sent`, so the brief does not list them and the kind can offer them again. The text session also undoes the batch on its own board, so the next drawing is planned on the board the child sees.
- No word means not shown: a batch with no word stays sent for the rest of the call. The first word for a batch stands; a second word, or a word for a batch Maya did not send, changes nothing.
- Chat: the desk reads its board history (`chatBoardFates`, `src/lib/board-fate.ts`) and sends the fates of Maya's newest 16 batches with the child's next message (`fates` on the chat request, at most 32, read by `readFateReports`). The admin test call screen plays every batch, so it reports each one as shown.
- Voice: the worker reads the board log that the child's screen already returns over the board connection (`snapshotFates`): a `batch` event is shown, a `cancelled` event is cancelled. A batch the board core refused at staging is reported as skipped (`boardRefused`). The session hears them at once; they are saved with the next turn.
- Code's safety rules do not change: Maya's strokes never cover the child's ink, the board math is code-built, and the stream gate and Maya's words do not change.
- Trace version 13 records each batch's `fate` and `counts.boardFates` (shown, skipped, cancelled, unreported).
- Tests: `src/lib/maya-text-board-fate.test.ts` (session), `src/lib/board-fate.test.ts` (the desk and the worker), `src/lib/maya-chat-board-fate.test.ts` (a chat end to end with the in-memory seams).

## Trace

`counts.overrides` counts Maya turns where code changed the model's first words (a refusal, a fallback or a dropped sentence); the target is under 5% of Maya turns. `counts.longestMayaRun` is the longest run of Maya turns with no child turn (target 1). `counts.dropped` counts sentences the controller's review dropped.

## Scope

Phase 1: 2-digit whole-number addition and subtraction (`isTutorQuestion`), on admin test calls (`textSession` in `src/lib/maya-call.ts`), in chat and voice. Family calls keep the controller while `MAYA_TUTOR_FAMILIES` is off (below). The family switches stay off.

## Family calls (`MAYA_TUTOR_FAMILIES`)

The server switch `MAYA_TUTOR_FAMILIES` lets the tutor core teach family calls: the desk chat (kind `chat`, channel `chat`) and the child's voice call from the family desk (kind `family`). Only the exact value `on` turns it on. `callSeams` (`src/lib/maya-call-seams.ts`) reads it for the site and the voice worker and passes `tutorFamilies` to the call module; `src/lib/maya-call.ts` never reads the environment. The switch is off by default in code. Savar approved it for families on 2026-11-15 (option B); see "First-week review and kill switches" below.

- The rule: `tutor = seams.tutor !== false && (kind === "admin_test" || (tutorFamilies && (kind === "chat" || kind === "family")))`. The core still decides per question: a question no tutor kind fits keeps the controller.
- The safety review of each sentence that is not plain teaching runs on family calls too: the call module gives every kind the reviewer. Free talk stays off for chat and family; the tutor's review does not depend on it. Without a reviewer (no `OPENROUTER_API_KEY`) a tutor sentence that needs a review is refused; after the one repair, code's honest line is said.
- The chat channel: chat does not stream, and the tutor's board drawings (`put`, `regroup`, `write`) are ordinary board batches that "Our board" takes. The chat's code-owned safety close is unchanged.
- A call keeps what it started with: a resumed call reads its saved session, whatever the switch is now.
- Tests: `src/lib/maya-call-tutor-families.test.ts` and `src/lib/maya-call-seams.test.ts`.

Phase 2 moves every Book 1 question type to the tutor core, and deletes the controller's teaching code as each type moves. Phase 3 rebuilt the practice judge (T01 to T10 plus the trace metrics, `npm run maya:practice -- --tutor`, `docs/maya-practice.md`) and continues the latency work on the single call.

## First-week review and kill switches

Families have been on the tutor core since 2026-11-15 (Savar, option B). For the first week, someone reads a daily review of every family call, and two kill switches stay ready.

**State on 2026-11-15**

- `MAYA_TUTOR_FAMILIES=on` and `MAYA_CHAT_ENABLED=on` are set in Vercel Production. `MAYA_TUTOR_FAMILIES=on` is also set in the voice worker's secrets (LiveKit agent `maya-voice`).
- Family voice stays closed: `MAYA_VOICE_ENABLED` is unset in Vercel Production (`src/lib/maya-voice-desk.ts`). A test family still has voice. Open it only after one live test-family voice call proves #992 and Savar approves.
- A call keeps what it started with. A change of a switch does not move a call that is already live.

**Kill switch 1: families back to the controller**

1. Unset `MAYA_TUTOR_FAMILIES` in Vercel Production, then redeploy (a new deploy reads the new value).
2. Remove it from the worker's secrets, so voice calls stop using the tutor core: `lk agent update-secrets` for agent `maya-voice` (with the secret removed from the env file you give it), then check the agent's secrets with `lk agent secrets`.
3. New family calls and chats then use the controller. Admin test calls still use the tutor core.

**Kill switch 2: stop desk chat**

- Set `MAYA_CHAT_ENABLED=off` in Vercel Production and redeploy. Desk chat stops for every family except test families. Read on each request; `docs/maya-chat.md`.

**The daily review**

`npm run maya:family-review` reads production (SELECT only) and prints a short markdown report. It needs `SUPABASE_SECRET_KEY` (or `SUPABASE_SECRET_KEY_FILE`, a file that holds the key) in the environment. It never prints the key.

```
npm run maya:family-review -- [--hours 24] [--out <file>] [--json]
```

- It lists every family call (kind `chat` or `family`, voice and chat; never `admin_test`) that started in the window. For each call: id, start time, kind and mode, real or test family (`public.test_accounts`) with a short family id, question, turn counts, path (tutor or controller), and the admin call link (`/admin/maya/<id>`). It shows no child name, parent name or email.
- Code reads five flags from the saved trace, with no AI:
  1. **Override, repair or fallback.** Count and kind of each (`counts.overrides` rules).
  2. **Math-review refusal.** Any review whose final result is not "true", with the sentence (`attempts[].math`).
  3. **Judgment word after a wrong answer.** A Maya sentence that holds right, correct, yes, good job, perfect, exactly, great, well done, nice or that's it, after a child's turn that the reading calls wrong (or after a rise in `finalMisses`). A negated word ("not quite right") is no match. This is a review flag: the fixed list can flag a word in another sense, such as "on the right".
  4. **Help level against Maya's words.** Maya's words held the answer value before the child said it, but the call records less than `answer_given`, or the parent note says the child needed no help. It reads digits only, and the answer from the stored package (or from the question text of a plain "a + b" or "a - b").
  5. **Safety.** Any call flag, safety flag or `maya_call_alerts` row.
- The report has totals first (calls, real and test, tutor and controller, flagged count by flag), then one block per flagged call, then one line of clean calls. The command exits 0 on success and 2 when the read fails.
- Read each flagged call on its admin page. A flag asks a person to look. It is no verdict. If a flag shows a real fault, use kill switch 1 or 2, then open a ticket.
- Code: `src/lib/maya-family-review.ts` (pure, tested in `src/lib/maya-family-review.test.ts`) and `scripts/maya-family-review-cli.ts`.
