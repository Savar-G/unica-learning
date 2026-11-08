# Maya's spot-the-error path (Wave C, C2)

Branch `site/maya-spot-error`, base `site/maya-wave-c` (2c52c596). Scope: the 19 "Spot the error" questions of the first customer's book (draft 90559915, revision 2). The numbers here are synthetic.

## 1. What is printed and stored

A spot-the-error item prints a question and a worked answer: "6 × 830 = ? Answer given: 498." (`workbook-book.ts` prints `Answer given:` from the item's `template-shown` check). The child ticks **Is it right?** (Yes or No) and, when it is not, writes the right answer in the **Fix it** box. The stored package has no operation. Its item holds exactly:

| Region | Kind | Check |
|---|---|---|
| `right` | choice, tick, `["Yes", "No"]`, label "Is it right?" | `template-shown`: No when the shown answer is not the template's answer |
| `fix` | box, a number, label "Fix it" | `template`: the template's answer |

Both checks hold the same template source. The question under the worked answer is one Maya already teaches:

| Template | Count | Underlying path |
|---|---|---|
| 5.1-place-value-million (digit, value) | 6 | B1a place value (#738) |
| 5.9-multiply-tens bare | 5 | A1 one-step multiply |
| 5.9-distributive bare | 1 | A1 one-step multiply |
| 5.9-multiply-tens missing, 5.9-distributive missing | 6 | A3 missing number (#732) |
| 5.10-pattern-rule story | 1 | C1 patterns (not landed: held) |

## 2. The deriver (`src/lib/maya-teaching/spot-error.ts`)

1. The item must be exactly the shape above (an allow-list: two regions, two checks, the same source, the printed labels, a shown answer of digits only).
2. The underlying question is the same package seen as a one-box `write-number` item: the printed text, the `fix` region and its `template` check. The existing derivers (missing number, one-step, place value) run on it unchanged, so each keeps its own three agreements: the printed text by a closed form, code's result equal to the answer key, and the template's expression on the stored slots.
3. The spot item adds its own: the result is the `fix` key, the template's answer text; "right" is code's comparison of the result with the shown answer (`Yes` only when they are the same number), and it must equal the `right` key and the `template-shown` rule.
4. The teaching package is the underlying one's teaching data on the stored, unchanged spot package (operation, answer = the fix, steps, the shown answer as an expected wrong answer, the easier example).

## 3. The session (`src/lib/maya/spot-error.ts`)

The session teaches it as a claim (A4, `claim.ts`) with a fix:

READY → OPEN → (MODEL_EXAMPLE) → the underlying path's own steps → the compare step `claim` (the result, compared with the answer given) → the word, yes or no, as the final answer → WRITE_CLOSE: tick it, and write the fix.

- **Steps.** The underlying steps (place-value digit, missing-number framing and division, multiply rows) come first, taught by their own paths. Then the claim's compare step: its value is the fix. It has H0 to H2 and **no H3**, because showing it would give the fix away. Then the word.
- **The word** is read by code: claim.ts's reader, with the spot words added from an allow-list (`right` and `correct` for yes; `wrong`, `not right`, `incorrect` for no). Lesson 5 holds as in A4: a bare yes or no counts only when Maya's last accepted turn asked "Is the answer given right?". After any other question it answers that question.
- **No early word.** A committed "It's wrong." before the fix is known (the compare step not done and not said in the same turn) is not an answer yet: the fix would be missing, and Maya's answer line would say it. Maya goes on with the work.
- **Accept and write.** "Well done! 6 × 830 is 4980, not 498. You tick no." Then "Tick no, and write 4980 in the Fix it box." The fix is the child's own result: the compare step was credited from their words.
- **J06.** A result said early or in a full sentence ("6 times 830 is 4980, so it's wrong.") credits the compare step once (claim.ts templates, plus the spot forms "it should be N", "the right answer is N", "the missing number is N", "the value is N", "the digit is N"), and Maya goes on to the word, never repeating the step. A question about the step ("Why do I compare?") gets code's why line.
- **Way out (lessons 7, 10).** At the top of a step (H2 on the compare and word steps), a child who only asks for help gets the easier example, then A4's honest close. No `give_answer` anywhere.

## 4. The easier example (lesson 11)

A spot-the-error of the same shape: the underlying path's easier example (already checked for giveaways), with a code-made wrong answer given: its result over 10, else times 10, else plus 1. Refused when the given answer equals the question's result or shown answer, or when the question's result is that number times a power of 10 or begins with its digits.

## 5. Shared files

Small hooks only: `session.ts` (the session package, the step credit, the reveal check, the place-value stuck rule extended to spot), `lines.ts` (the spot lines wrap the package lines; the templates), `claim.ts` (the word reader and lower-case choices), `scope.ts` (a dropped zero, "498 times 10 is 4980"), `maya-teaching/index.ts` (the deriver).

## 6. Held

- `d7p2s2.1` (5.10-pattern-rule story): its underlying question is a pattern rule, C1's path, which has not landed. It stays held.
