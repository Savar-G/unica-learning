// Why a draft question failed, in plain words for the admin workbook pages (#379). The generator writes each failed
// check's reason for the AI's rewrite ("it works the same sum as question 23 on this page (…)"); the admin page shows
// a short line instead ("Same sum as question 23") and keeps the technical text in a tooltip. The reason's kind is
// read from its words: a reason with no plain line here shows "Needs a look", never the raw text. Pure: no I/O.

type Rule = [RegExp, string | ((m: RegExpExecArray) => string)];

/** Each kind of reason the generator, the solve check and the fit check write, most specific first. */
const RULES: Rule[] = [
  // The solve check (a second AI answers the printed question).
  [/^the solve check read the printed question another way/, "Checking AI got a different answer"],
  [/^the solve check (could not confirm|was late|failed)/, "Checking AI couldn't check it"],
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
  // The AI wrote nothing, or ran out of tries.
  [/^the AI gave no answer|^the AI wrote nothing/, "The AI wrote nothing usable"],
  [/used its AI attempts/, "Ran out of tries"],
  [/^code could not build the question/, "Couldn't build the question"],
  // Numbers and math for the level.
  [/is too big for this question/, "A number is too big for this level"],
  [/this question uses no |is negative: /, "Uses math from a later level"],
  [/is a number in words/, "A number is written in words"],
  // The easier example.
  [/easier example has the question's answer/, "Easier example has the same answer"],
  [/easier example is not smaller/, "Easier example isn't easier"],
  [/no easier example|easier example has no text|easier example is not the same operation|^the easier example/, "Easier example doesn't work"],
  // The words and the answer.
  [/is a count: write it as the sequence|^the text counts (from|back|up|by)|^the text starts at/, "Words don't match the number pattern"],
  [/^the text names|^the text asks how many|^the operation works .* but the text/, "Words don't match the math"],
  [/its answer is the operation's number|is a right answer|is not the answer's|is not the unit of the answer|accepted form/, "Answer doesn't match"],
  [/^a draw item asks/, "Unclear what to draw"],
  [/^an order item asks to put/, "Doesn't ask to put the numbers in order"],
  [/Sam's (mistake|steps)/, "Spot-the-mistake example doesn't work"],
  [/needs an operation|has no operation/, "Can't work out the answer"],
  [/^the \S+ place takes the .* format/, "Wrong type of question for this spot"],
  [/^the skill .* (is not one the plan asks for|is not in the BC skill map)/, "Wrong skill for this page"],
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
