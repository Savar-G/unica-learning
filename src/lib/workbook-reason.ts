// Why a draft question failed, in plain words for the admin workbook pages (#379). The generator writes each failed
// check's reason for the AI's rewrite ("it works the same sum as question 23 on this page (…)"); the admin page shows
// a short line instead ("Same sum as question 23") and keeps the technical text in a tooltip. The reason's kind is
// read from its words: a reason with no plain line here shows "Needs a look", never the raw text. Pure: no I/O.

type Rule = [RegExp, string | ((m: RegExpExecArray) => string)];

/**
 * Each kind of reason the generator, the package and item checks (question-package*.ts, number-words.ts,
 * workbook-book.ts), the solve check and the fit check write, most specific first. A new kind of reason needs a line
 * here, and an example in workbook-reason.test.ts.
 */
const RULES: Rule[] = [
  // The solve check (a second AI answers the printed question).
  [/^the solve check read the printed question another way/, "Checking AI got a different answer"],
  [/^the solve check (could not confirm|was late|failed)/, "Checking AI couldn't check it"],
  // The AI wrote nothing, or ran out of tries; code could not build it.
  [/^the AI gave no answer|^the AI wrote nothing/, "The AI wrote nothing usable"],
  [/used its AI attempts/, "Ran out of tries"],
  [/^code could not build the question/, "Couldn't build the question"],
  // Repeats, on the page or in the book.
  [/repeats a question already asked on page (\d+)/, (m) => `Repeats a question from page ${m[1]}`],
  [/the book already asks this kind of question/, "Same kind of question too often in the book"],
  [/works the same sum as question (\d+)/, (m) => `Same sum as question ${m[1]}`],
  [/^its text is the same as question (\d+)/, (m) => `Same words as question ${m[1]}`],
  [/^it is the same as question (\d+)/, (m) => `Same as question ${m[1]}`],
  [/^it differs from question (\d+) .*only by one number/, (m) => `Only one number different from question ${m[1]}`],
  [/same kind of question as question (\d+)/, (m) => `Same kind of question as question ${m[1]}`],
  // The question gives its answer away.
  [/gives its own answer/, "Gives away its answer"],
  [/adding or taking away 0/, "Adds or takes away 0"],
  // A package with no operation keeps its answers in its item.
  [/^a package with no operation/, "Answer key is in the wrong place"],
  // The easier example.
  [/easier example has the question's answer/, "Easier example has the same answer"],
  [/easier example is not smaller/, "Easier example isn't easier"],
  [/no easier example|easier example has no text|easier example is not the same operation|^the easier example/, "Easier example doesn't work"],
  // The words the AI printed, and the numbers for the level.
  [/is too big for this question/, "A number is too big for this level"],
  [/this question uses (no |none)|is negative: /, "Uses math from a later level"],
  [/is a number in words/, "A number is written in words"],
  [/is not a number form we print/, "A number is written in a form we don't print"],
  [/^the character .* is not allowed/, "Uses a character we can't print"],
  // The words and the answer.
  [/is a count: write it as the sequence|^the text counts (from|back|up|by)|^the text starts at/, "Words don't match the number pattern"],
  [/^the text says the picture shows/, "Words don't match the picture"],
  [/^the text (names|asks)|^the operation works .* but the text/, "Words don't match the math"],
  [/^a draw item asks/, "Unclear what to draw"],
  [/^an order item asks to put/, "Doesn't ask to put the numbers in order"],
  // Spot the mistake (Sam's wrong steps).
  [/Sam's (mistake|steps)|^a spot-the-error item|^a shown wrong solution|^the shown (error|answer)|^a shown-answer statement|shows a wrong solution/, "Spot-the-mistake example doesn't work"],
  // The answer key.
  [/^the wrong answer \S+ is a right answer/, "A listed wrong answer is right"],
  [/wrong answers?\b/, "Wrong answers list doesn't work"],
  [/accepted form|takes only its answer/, "Other accepted answers don't work"],
  [/^the unit |is not in .*, the unit the question asks for|do not measure the same thing/, "Wrong unit"],
  [/holds .*, but the picture shows/, "Answer doesn't match the picture"],
  [/^the picture shows .*, not /, "Picture doesn't match the question"],
  [/its answer is the operation's number|holds .*, but |answer is not what its operation gives|is not the answer's|is not the unit of the answer|^is .*, but its operation gives|which is not true/, "Answer doesn't match"],
  [/^two equations are .*: the ways must differ/, "Two answers are the same"],
  [/holds .*, not a number/, "Answer box holds no number"],
  [/has no choice for|does not offer the relation's choices|'s answer is not one of its choices/, "The right choice is missing"],
  [/code cannot read|^the steps version|^a version 1 package/, "Saved in a form code can't read"],
  [/worked steps/, "Worked steps don't match the math"],
  [/^the answer is missing|answer is missing|'s answer (is not|has)|code cannot check answers of type/, "Answer is missing or unreadable"],
  // The skill, level and place.
  [/^the \S+ place takes the .* format/, "Wrong type of question for this spot"],
  [/^the skill .* (is not one the plan asks for|is not in the BC skill map)/, "Wrong skill for this page"],
  [/^the standard .* is not in the BC skill map|is not a skill of standard|^the skill needs a standard/, "Skill isn't in the skill map"],
  [/^the level is not|^the difficulty is not/, "Level or difficulty is out of range"],
  [/reference/, "Missing where the question belongs"],
  [/^the package (is not an object|has no id)|^the template id|^the question has no text/, "Question is missing its words or id"],
  // The kind of question and its picture.
  [/^the item format is not one the generator builds|^the item's format is not one code knows/, "A question type the generator can't make"],
  [/^a panel's worked example/, "Worked example code can't work out"],
  [/^a pattern item|^a pattern (check|figure)|^a pattern's core|^a pattern (needs|shows)/, "Shape pattern is missing a part"],
  [/^a places item|^the places check|^a part of the places check|but the item has no box for the/, "Place value boxes don't work"],
  [/^an order item|^the order check/, "Numbers to put in order don't work"],
  [/^a sequence item|^the sequence('s| check)/, "Number pattern doesn't work"],
  [/^a compare item needs/, "Comparison needs two numbers"],
  [/relation|is halfway between|^the two numbers are the same/, "Which-is-more question doesn't work"],
  [/^a Mixed set item/, "Mixed set needs a +, −, × or ÷ sum"],
  [/^the yes-no check|^the statement has/, "Yes-or-no question doesn't work"],
  [/^the picture is not|picture|figure|ten-frame|base-ten blocks|^an array|number line|draws dots|^a count (item|check)/, "The picture doesn't work"],
  [/needs an operation|has no operation|needs the package's operation/, "Can't work out the answer"],
  [/^an? \S+ item (has no|needs|has at most)|region|^the item|^a scorable item|^a check has|^the \S+ check (names|needs)|^the equations check|is never scorable/, "Answer boxes are set up wrong"],
  // The math itself.
  [/below zero/, "Answer would be below zero"],
  [/by zero|divides by 0/, "Divides by zero"],
  [/known part is more than the total/, "A part is bigger than the whole"],
  [/is already (solved|in)|the two times are the same|the time to add is 0/, "Nothing to work out"],
  [/^the (operation|expression|equation|conversion|solution|value|values|amount|two times|time between|unit asked|new denominator)\b|^only an amount of money|^an amount in/, "The math can't be worked out"],
  // The fit check (the page's layout).
  [/runs \d+ px past the bottom|does not fit/, "Doesn't fit on the page"],
  [/slot holds \d+ items/, "Too many questions in one part"],
  [/(answer box covers|choices cover) its own text/, "Answer box covers the words"],
  [/px; the design allows no less than/, "Too small to read"],
];

export const NEEDS_A_LOOK = "Needs a look";

/** A failed check's reason as a short plain line ("Same sum as question 23"); "Needs a look" for an unknown kind. */
export function plainReason(reason: string): string {
  for (const [pattern, line] of RULES) {
    const m = pattern.exec(reason);
    if (m) return typeof line === "string" ? line : line(m);
  }
  return NEEDS_A_LOOK;
}

const FAILED = /^question \d+ failed: /;
const FIT = /^fit check: (?:day \d+ page \d+ \([^)]*\): )?/;

/**
 * A page problem as one plain line, "Question 3: Same sum as question 23" (the question's number only when the line
 * does not name it). A failed question's or fit check's problem gets its plain reason; any other problem (the page
 * did not render) keeps its own words, which are plain already.
 */
export function plainProblem(p: { question: number | null; reason: string }): string {
  const failed = FAILED.exec(p.reason);
  const fit = !failed && FIT.exec(p.reason);
  const line = failed ? plainReason(p.reason.slice(failed[0].length)) : fit ? plainReason(p.reason.slice(fit[0].length)) : p.reason;
  if (!p.question || new RegExp(`\\bquestion ${p.question}\\b`, "i").test(line)) return line;
  return `Question ${p.question}: ${line}`;
}
