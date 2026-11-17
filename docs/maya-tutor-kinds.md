# Tutor kinds: how a question family joins the tutor core (D-345, Phase 2)

Read `docs/maya-tutor.md` first. The tutor core is general: the model is the tutor, and code is the safety net. A question family joins the core through one **tutor kind**: code that gives the facts of a question. It holds no teaching logic and no model words.

## The frozen interface

`src/lib/maya/tutor-kind.ts` (`TutorKind`) is FROZEN. A builder never changes it, and never changes the core:

- `tutor.ts`, `tutor-math.ts`, `tutor-prompt.ts`, `proposeTutor` and `tutorTeachingNow` in `session.ts`;
- the stream in `maya-text.ts`, and `math-vocab.ts`.

If a family needs a core change, the builder stops and reports it to the Maya lead with the reason. The lead makes the change.

A builder adds only:

- `src/lib/maya/tutor-kinds/<family>.ts`: the kind;
- `src/lib/maya/tutor-kinds/<family>.test.ts`: `describeTutorKind(kind, packages)` from `contract.ts`, plus the family's own tests;
- one line in `src/lib/maya/tutor-kinds/index.ts`, before any kind the family must win over.

The first kind that fits a question teaches it. A kind may import another kind's file.

## What each method gives

| Method | Gives | Rule |
|---|---|---|
| `fits(pkg)` | whether the kind teaches the package | Fit only what the kind fully reads. Any other package keeps the controller. |
| `fits(pkg)`, for a word problem | the final question asks for exactly what the stored operation computes | Pre-launch check 2: closed question forms per kind (`tutor-kinds/asks.ts`): "how many ... in all / altogether / left / now / in 5 bins / more ... does Ava score", "what is the value of the P digit", "true or false: A > B" with the stored relation and sides. A counted thing must follow a printed number and must not be a group (a box, a bag, a day). Any other form, a word such as "double", "half", "sold" or "at first", or a printed relation that differs from the stored one: no fit. |
| `steps(pkg)` | every work step: id, place, work in plain words with true math, result | Ids are the package's own work step ids. The `work` text passes `checkTutorSay` (the contract checks it). |
| `numberMeaning(pkg, n)` | right for a step or the answer, a named likely mistake, or "not a value of this question" | Name real mistakes of the family (the column kind's smaller-from-larger is the model). |
| `workValues(pkg)` | values that are never a wrong answer | Step results, digits and intermediate values the child may say. |
| `streamScope(pkg)` | the numbers and operations (`expressionKey`) a streamed sentence may hold | Too few only costs speed; too many lets an outside answer stream. |
| `stepQuestion(pkg, done)` | the next open step's question, for code's honest line | Plain, and its math passes `checkTutorSay`. |
| `drawings(pkg)`, `draw(...)` | the board requests and their commands | Commands come from the checked steps only. Use the board ops in `src/lib/board`. The board must take them (the contract applies them). Use `noteFromEquation` for a "note". |
| `claimProblems(pkg, sentence)` | the family's own true-math checks of Maya's sentence | Fail closed. The core reads equations, place quantities and trades (`tutor-math.ts`); the kind reads its own claim forms ("the 9 is in the thousands place", "6 × 870 is greater than 5226"). A false claim the kind can read must be refused. |
| `op(pkg)` | the trade direction for "is now" / "becomes" claims | Only for kinds with column trades. |
| `notes(pkg)` | short facts about how the idea is worked | Facts, not teaching rules. |

## Checks before a PR

- `"$G" npx vitest run src/lib/maya/tutor-kinds/ src/lib/maya/tutor.test.ts src/lib/maya-text-tutor.test.ts src/lib/maya/tutor-corpus.test.ts --maxWorkers=2`, with `G=/Users/savargupta/unica-workbook-samples/customer-first-book-20261106/maya-coverage/gate-slot.sh`. Never run the full suite on the Mac; CI runs it.
- `"$G" npx next typegen`, then `"$G" npx tsc --noEmit -p .` and `"$G" npx eslint src/lib/maya`.
- Book 1 census: run the census script the Maya lead gives in the brief. It counts how many of the family's Book 1 questions the kind now fits. The Book 1 packages are a customer's book: never copy them into the repository. Build test packages with `workedSteps` (`src/lib/question-package.ts`) or the samples in `src/lib/maya-samples.ts`.
- Optional: at most 3 real-model runs with `npm run maya:text -- --model openrouter --tutor --question <package.json>`, using the key `MAYA_OPENROUTER_API_KEY="$(security find-generic-password -s unica-maya-openrouter -w)"`. Never print the key.

## The PR

- **Branch:** `site/maya-tutor-<family>` from `origin/site/maya-tutor-kinds`. Push once, when the checks pass.
- **PR:** base `main`, with "Stacked on #1006 and the kind interface PR" in the body.
- **Report to the Maya lead:**
  - the PR link and its head;
  - the census count;
  - the Book 1 types the kind does not fit, and why;
  - any core change the family needs.
