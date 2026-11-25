// The checker of a division on its paper, with steps written by hand. The shapes are not used here.
import { describe, expect, it } from "vitest";
import type { Answer, Step, StepMark } from "../contract";
import { divisionProblem } from "./division-steps";
import { step } from "./shape-registration";
import { stepProblems, type WorkedQuestion } from "./shape-steps";
import { linesProblem, marksProblem } from "./step-marks";
import { readStep } from "./steps-evaluator";

/** Steps as lines: "text | marks". The last line is the answer. */
const paper = (lines: readonly string[]): Step[] => lines.map((line) => step(...(line.split(" | ") as [string, string?])));
const answerOf = (line: string): Answer => {
  const [quotient, remainder] = line.split(" R");
  const part = (name: string, value: string) => ({ name, kind: "whole-number" as const, value });
  return { parts: remainder === undefined ? [part("answer", quotient)] : [part("quotient", quotient), part("remainder", remainder)] };
};
/** "37÷4" in a line, "4)37" in a bracket; a remainder in the last line asks for two areas. */
const rowsOf = (question: string, last: string): string[] => {
  const blanks = last.includes("R") ? "□R□" : "□";
  return question.includes(")") ? [blanks, question] : [`${question}=${blanks}`];
};
const problem = (question: string, lines: readonly string[], answer = lines[lines.length - 1]): string | null => divisionProblem(paper(lines), answerOf(answer), rowsOf(question, answer));
const but = (lines: readonly string[], index: number, ...others: string[]): string[] => [...lines.slice(0, index), ...others, ...lines.slice(index + 1)];

const ONE = ["4 × 9 = 36, 4 × 10 = 40 is too much, write 9 | q9@0 p3@1#1 p6@0#1", "37 - 36 = 1 | r1@0#2", "9 R1"];
const TWO = ["4 is less than 6, use 43", "6 × 7 = 42, 6 × 8 = 48 is too much, write 7 | q7@1 p4@2#1 p2@1#1", "43 - 42 = 1, bring down 8, now 18 | r1@1#2 d8@0#2", "6 × 3 = 18, 6 × 4 = 24 is too much, write 3 | q3@0 p1@1#3 p8@0#3", "18 - 18 = 0 | r0@0#4", "73"];
const ZERO = ["6 × 1 = 6, 6 × 2 = 12 is too much, write 1 | q1@2 p6@2#1", "6 - 6 = 0, bring down 1, now 1 | r0@2#2 d1@1#2", "1 is less than 6, write 0, bring down 4, now 14 | q0@1 d4@0#2", "6 × 2 = 12, 6 × 3 = 18 is too much, write 2 | q2@0 p1@1#3 p2@0#3", "14 - 12 = 2 | r2@0#4", "102 R2"];
const ZERO_AT_END = ["6 × 1 = 6, 6 × 2 = 12 is too much, write 1 | q1@2 p6@2#1", "6 - 6 = 0, bring down 0, now 0 | r0@2#2 d0@1#2", "0 is less than 6, write 0, bring down 5, now 5 | q0@1 d5@0#2", "5 is less than 6, write 0 | q0@0", "100 R5"];
const LESS = ["3 is less than 4, write 0 | q0@0", "0 R3"];

describe("the paper of a division", () => {
  it.each<[string, string, string[]]>([
    ["one digit with something left", "37÷4", ONE], ["the same in a bracket", "4)37", ONE], ["two digits used together", "6)438", TWO], ["a zero inside", "6)614", ZERO],
    ["zeros at the end", "6)605", ZERO_AT_END], ["a dividend that is less than the divisor", "3÷4", LESS],
    ["nothing left, with two areas", "36÷4", ["4 × 9 = 36, 4 × 10 = 40 is too much, write 9 | q9@0 p3@1#1 p6@0#1", "36 - 36 = 0 | r0@0#2", "9 R0"]],
    ["three digits of the quotient", "2)999", ["2 × 4 = 8, 2 × 5 = 10 is too much, write 4 | q4@2 p8@2#1", "9 - 8 = 1, bring down 9, now 19 | r1@2#2 d9@1#2", "2 × 9 = 18, 2 × 10 = 20 is too much, write 9 | q9@1 p1@2#3 p8@1#3", "19 - 18 = 1, bring down 9, now 19 | r1@1#4 d9@0#4", "2 × 9 = 18, 2 × 10 = 20 is too much, write 9 | q9@0 p1@1#5 p8@0#5", "19 - 18 = 1 | r1@0#6", "499 R1"]],
  ])("takes %s", (_name, question, lines) => expect(problem(question, lines)).toBeNull());

  it.each<[string, string, string[], RegExp]>([
    ["a multiple that is not the largest", "37÷4", ["4 × 8 = 32, 4 × 9 = 36 is too much, write 8 | q8@0 p3@1#1 p2@0#1", "37 - 32 = 5 | r5@0#2", "8 R5"], /4 × 9 = 36 is too much, and 36 is not more than 37$/],
    ["a multiple that is too much", "37÷4", ["4 × 10 = 40, 4 × 11 = 44 is too much, write 10 | q1@0 p4@1#1 p0@0#1", "9 R1"], /says 4 × 10 = 40, and 40 is more than 37$/],
    ["no word about the next multiple", "37÷4", but(ONE, 0, "4 × 9 = 36 | q9@0 p3@1#1 p6@0#1"), /must estimate how many times 4 fits into 37$/],
    ["another divisor", "37÷4", but(ONE, 0, "9 × 4 = 36, 9 × 5 = 45 is too much, write 4 | q4@0 p3@1#1 p6@0#1"), /must multiply 4, and it multiplies 9$/],
    ["the numbers of a multiple turned round", "36÷4", ["9 × 4 = 36, 9 × 5 = 45 is too much, write 4 | q4@0 p3@1#1 p6@0#1", "36 - 36 = 0 | r0@0#2", "4 R0"], /must multiply 4/],
    ["the steps of another dividend", "38÷4", ONE, /must subtract 38 - 36$/],
    ["the steps of another question with the same answer", "6)438", TWO.map((l) => l.replaceAll("6 ×", "5 ×")), /holds "5 × 7 = 42"$/],
    ["a wrong rest", "37÷4", but(ONE, 1, "37 - 36 = 2 | r2@0#2"), /holds "37 - 36 = 2"/],
    ["a rest mark that is not the rest", "37÷4", but(ONE, 1, "37 - 36 = 1 | r2@0#2"), /marks/],
    ["a rest with no mark", "37÷4", but(ONE, 1, "37 - 36 = 1"), /marks/],
    ["a quotient digit at another place", "37÷4", but(ONE, 0, ONE[0].replace("q9@0", "q9@1")), /marks/],
    ["no mark of the quotient digit", "37÷4", but(ONE, 0, ONE[0].replace("q9@0 ", "")), /marks/],
    ["another quotient digit in the marks", "37÷4", but(ONE, 0, ONE[0].replace("q9@0", "q8@0")), /marks/],
    ["another quotient digit in the words", "37÷4", but(ONE, 0, ONE[0].replace("write 9", "write 8")), /write 8/],
    ["no word of the quotient digit", "37÷4", but(ONE, 0, ONE[0].replace(", write 9", "")), /no step of a division has/],
    ["a product that stands one place too far", "37÷4", but(ONE, 0, ONE[0].replace("p3@1#1 p6@0#1", "p3@2#1 p6@1#1")), /marks/],
    ["a product in another row", "37÷4", but(ONE, 0, ONE[0].replaceAll("#1", "#2")), /marks/],
    ["a product with one digit less", "37÷4", but(ONE, 0, ONE[0].replace("p3@1#1 ", "")), /marks/],
    ["marks in another order", "37÷4", but(ONE, 0, ONE[0].replace("q9@0 p3@1#1", "p3@1#1 q9@0")), /marks/],
    ["a mark twice", "37÷4", but(ONE, 1, "37 - 36 = 1 | r1@0#2 r1@0#2"), /marks/],
    ["a rest that is not said", "37÷4", but(ONE, 1), /no step says what is left of 37$/],
    ["an estimate that is not said", "37÷4", but(ONE, 0), /must estimate how many times 4 fits into 37$/],
    ["an estimate two times", "37÷4", but(ONE, 0, ONE[0], ONE[0]), /must subtract 37 - 36$/],
    ["a rest two times", "37÷4", but(ONE, 1, ONE[1], ONE[1]), /after its last digit/],
    ["steps in another order", "37÷4", [ONE[1], ONE[0], ONE[2]], /must estimate how many times 4 fits into 37$/],
    ["a first digit that is too small and is not said", "6)438", but(TWO, 0), /must say "4 is less than 6, use 43"$/],
    ["two digits used when the first is enough", "6)614", ["6 is less than 6, use 61", ...ZERO.slice(1)], /"6 is less than 6" is not true$/],
    ["a zero in front of the quotient", "6)438", ["4 is less than 6, write 0, bring down 3, now 43 | q0@2 d3@1#1", ...TWO.slice(1)], /must say "4 is less than 6, use 43"/],
    ["three digits used together", "6)438", but(TWO, 0, "4 is less than 6, use 438"), /"use 438" does not go on from 4$/],
    ["marks of a step that only looks", "6)438", but(TWO, 0, "4 is less than 6, use 43 | q0@2"), /marks/],
    ["another digit brought down", "6)438", but(TWO, 2, "43 - 42 = 1, bring down 7, now 17 | r1@1#2 d7@0#2"), /bring down 8/],
    ["a wrong number after the bring-down", "6)438", but(TWO, 2, TWO[2].replace("now 18", "now 81")), /now 81/],
    ["no bring-down", "6)438", but(TWO, 2, "43 - 42 = 1 | r1@1#2"), /bring down 8/],
    ["a bring-down with no number", "6)438", but(TWO, 2, "43 - 42 = 1, bring down 8 | r1@1#2 d8@0#2"), /has the clauses equation bring-down, which no step of a division has$/],
    ["no mark of the digit that comes down", "6)438", but(TWO, 2, TWO[2].replace(" d8@0#2", "")), /marks/],
    ["the digit that comes down at another place", "6)438", but(TWO, 2, TWO[2].replace("d8@0#2", "d8@1#2")), /marks/],
    ["the digit that comes down in another row", "6)438", but(TWO, 2, TWO[2].replace("d8@0#2", "d8@0#3")), /marks/],
    ["a bring-down after the last digit", "37÷4", but(ONE, 1, "37 - 36 = 1, bring down 0, now 10 | r1@0#2 d0@0#2"), /brings down 0, and the dividend has no digit left$/],
    ["a digit that is left out", "6)438", [...TWO.slice(0, 3), "7"], /the digits of 18 are not worked$/],
    ["a zero that is not written", "6)614", but(ZERO, 2), /must say "1 is less than 6, write 0"$/],
    ["a zero that is said and not marked", "6)614", but(ZERO, 2, ZERO[2].replace("q0@1 ", "")), /marks/],
    ["a zero that is written as 1", "6)614", but(ZERO, 2, ZERO[2].replace("write 0", "write 1").replace("q0", "q1")), /"write 1" must be 0/],
    ["a zero where the divisor fits", "6)614", but(ZERO, 3, "14 is less than 6, write 0 | q0@0", "14 - 0 = 14 | r1@1#4"), /"14 is less than 6" is not true$/],
    ["a true smaller-than about other numbers", "6)614", but(ZERO, 2, ZERO[2].replace("1 is less than 6", "1 is less than 7")), /must say "1 is less than 6/],
    ["a comparison where the divisor fits", "36÷4", ["3 is less than 4, write 0, bring down 6, now 36 | q0@1 d6@0#1", "4 × 9 = 36, 4 × 10 = 40 is too much, write 9 | q9@0 p3@1#1 p6@0#1", "36 - 36 = 0 | r0@0#2", "9 R0"], /must estimate how many times 4 fits into 36/],
    ["two digits that are said and are the whole dividend", "37÷4", ["3 is less than 4, use 37", ...ONE], /must estimate how many times 4 fits into 37$/],
    ["another remainder than the last rest", "37÷4", ["4 × 9 = 36, 4 × 10 = 40 is too much, write 9 | q9@0 p3@1#1 p6@0#1", "37 - 36 = 1 | r1@0#2", "9 R2"], /1 is left over and the remainder is "2"$/],
    ["a rest with one area", "37÷4", but(ONE, 2, "9"), /1 is left over and the answer has no part for it$/],
    ["another quotient than its digits", "6)438", but(TWO, 5, "37"), /writes "73" and the answer is "37"$/],
    ["a rest that is written in the words too", "37÷4", but(ONE, 1, "37 - 36 = 1, write 1 | r1@0#2"), /must say only what is left$/],
    ["a rest with a number added", "37÷4", but(ONE, 1, "37 - 36 = 1, plus 1 is 2 | r1@0#2"), /must say only what is left$/],
    ["a step that is only a number", "37÷4", but(ONE, 1, "1 | r1@0#2"), /must subtract 37 - 36$/],
    ["a step that carries", "37÷4", but(ONE, 1, "37 - 36 = 1, write 1 | w1@0"), /holds a mark that is not one$/],
    ["a mark of a column", "37÷4", but(ONE, 1, "37 - 36 = 1 | w1@0"), /holds a mark that is not one$/],
    ["a borrow", "37÷4", but(ONE, 1, "borrow 1 ten, 3 tens become 2 tens | x3@1 b2@1 b17@0"), /holds a mark that is not one$/],
    ["words that nobody knows", "37÷4", but(ONE, 1, "37 - 36 is 1 | r1@0#2"), /cannot read/],
    ["a last step that draws something", "37÷4", but(ONE, 2, "9 R1 | q9@0"), /last step/],
    ["no steps at all", "37÷4", ["9 R1"], /the digits of 37 are not worked$/],
  ])("refuses %s", (_name, question, lines, message) => expect(problem(question, lines, lines[lines.length - 1])).toMatch(message));

  it.each([["two rows of a column", ["37", "÷4"]], ["no question", []], ["a blank that is not at the end", ["□÷4=9"]], ["no sign of a bracket", ["□R□", "437"]], ["two numbers in a row of a sum", ["37+4=□"]]])("refuses printed rows that are %s", (_name, rows) => {
    expect(divisionProblem(paper(ONE), answerOf("9 R1"), rows)).toMatch(/are no division/);
  });

  it("asks for as many areas as the answer has parts", () => {
    expect(divisionProblem(paper(ONE), answerOf("9 R1"), ["37÷4=□"])).toMatch(/areas/);
    expect(divisionProblem(paper(TWO), answerOf("73"), ["□R□", "6)438"])).toMatch(/areas/);
  });

  it.each<[string, object]>([
    ["no row", { mark: "product", place: 0, digit: "6" }], ["a row that is a word", { mark: "product", row: "top", place: 0, digit: "6" }], ["a quotient digit below the line", { mark: "quotient", row: 1, place: 0, digit: "6" }], ["a rest in the line of the quotient", { mark: "rest", row: 0, place: 0, digit: "6" }],
    ["half a row", { mark: "rest", row: 1.5, place: 0, digit: "6" }], ["two figures", { mark: "product", row: 1, place: 0, digit: "36" }], ["a field more", { mark: "product", row: 1, place: 0, digit: "6", color: "red" }], ["a place before the ones", { mark: "product", row: 1, place: -1, digit: "6" }],
  ])("refuses a mark with %s", (_name, mark) => {
    const steps = paper(ONE);
    expect(divisionProblem([{ ...steps[0], marks: [...steps[0].marks, mark as StepMark] }, ...steps.slice(1)], answerOf("9 R1"), ["37÷4=□R□"])).toMatch(/holds a mark that is not one/);
  });

  it("refuses any one number that is changed, in the words or in the marks, and any step that is left out or said twice", () => {
    for (const [question, lines] of [["37÷4", ONE], ["6)438", TWO], ["6)614", ZERO], ["6)605", ZERO_AT_END], ["3÷4", LESS]] as const) {
      const answer = lines[lines.length - 1];
      for (const [i, line] of lines.slice(0, -1).entries()) {
        for (const found of line.matchAll(/\d+/g)) for (const other of [String(Number(found[0]) + 1), "0", "10"]) {
          const changed = `${line.slice(0, found.index)}${other}${line.slice(found.index + found[0].length)}`;
          if (other !== found[0]) expect(problem(question, but(lines, i, changed), answer), changed).not.toBeNull();
        }
        expect(problem(question, but(lines, i), answer), `${question} without "${line}"`).not.toBeNull();
        expect(problem(question, but(lines, i, line, line), answer), `${question} twice "${line}"`).not.toBeNull();
      }
    }
  });
});

describe("the clauses of a division", () => {
  it.each([
    "4 is less than 6, use 43", "4 is less than 6, write 0", "0 is less than 6, write 0, bring down 5, now 5", "1 is less than 6, write 0, bring down 4, now 14",
    "4 × 9 = 36, 4 × 10 = 40 is too much, write 9", "43 - 42 = 1, bring down 8, now 18", "37 - 36 = 1",
  ])("reads %s", (text) => expect(readStep(text)).toEqual({ wrong: [], unread: [] }));

  it.each([
    "6 is less than 6, write 0", "7 is less than 6, use 70", "4 is less than 6", "4 is less than 6, write 4", "4 is less than 6, use 43, write 0", "4 is less than 6, use 53", "4 is less than 6, write 0, bring down 3", "4 is less than 6, write 0, bring down 3, now 34", "4 is less than 6, write 0, now 43",
    "4 × 9 = 36, 4 × 10 = 41 is too much, write 9", "4 × 9 = 36, 4 × 11 = 44 is too much, write 9", "4 × 9 = 36, 5 × 10 = 50 is too much, write 9", "4 × 9 = 36, 4 × 10 = 40 is too much, write 8", "4 × 9 = 36, 4 × 10 = 40 is too much", "4 × 9 = 36, 4 × 10 = 40 is too much, write 9, carry 1",
    "4 × 9 = 36, 4 × 10 = 40 is too much, write nothing", "36 + 4 = 40, 36 + 5 = 41 is too much, write 4", "4 × 9 = 36, write 9", "4 × 10 = 40 is too much, write 9", "4 × 10 = 40 is too much", "43 - 42 = 1, bring down 8", "43 - 42 = 1, now 18", "43 - 42 = 1, bring down 8, now 81",
    "43 - 42 = 1, write 1, bring down 8, now 18", "43 + 2 = 45, bring down 8, now 458", "4, bring down 8, now 48", "43 - 42 = 1, bring down 18, now 28", "bring down 8, now 18, 43 - 42 = 1", "43 - 42 = 1, bring down 8, bring down 8, now 18", "use 43", "now 18", "4 is less than 6, 4 × 1 = 4",
    "04 is less than 6, use 43", "4 is less than 6, use 043", "4 is less than 6, use 438", "borrow 1 ten, 4 tens become 3 tens, bring down 8, now 38", "4 is smaller than 6, use 43",
  ])("refuses %s", (text) => {
    const { wrong, unread } = readStep(text);
    expect(wrong.length + unread.length).toBeGreaterThan(0);
  });
});

describe("the clauses and marks of a division in other working", () => {
  const whole = (value: string): Answer => ({ parts: [{ name: "answer", kind: "whole-number", value }] });
  it.each<[string, string[], string[]]>([
    ["an estimate in a multiplication", ["20", "×2"], ["2 × 0 = 0, 2 × 1 = 2 is too much, write 0 | w0@0", "2 × 2 = 4 | w4@1", "40"]],
    ["a digit that comes down in a subtraction", ["42", "-11"], ["2 - 1 = 1, bring down 4, now 14 | w1@0", "4 - 1 = 3 | w3@1", "31"]],
    ["a division mark in a multiplication", ["21", "×2"], ["2 × 1 = 2, write 2 | w2@0 q2@0", "2 × 2 = 4 | w4@1", "42"]],
    ["a division mark in an addition", ["21", "+2"], ["1 + 2 = 3, write 3 | w3@0 r3@0#2", "2, write 2 | w2@1", "23"]],
    ["a division mark that says it is on the top row", ["21", "+2"], ["1 + 2 = 3, write 3 | w3@0", "2, write 2 | w2@1", "23"]],
  ])("columns refuse %s", (name, rows, lines) => {
    const steps = paper(lines);
    if (name.includes("top row")) steps[0].marks.push({ mark: "rest", row: "top", place: 0, digit: "3" } as unknown as StepMark);
    expect(marksProblem(steps, lines[lines.length - 1], rows)).not.toBeNull();
    expect(marksProblem(steps, lines[lines.length - 1], null)).not.toBeNull();
  });
  it("lines refuse both", () => {
    expect(linesProblem(paper(["4 × 9 = 36, 4 × 10 = 40 is too much, write 9", "36 ÷ 4 = 9", "9"]), whole("9"))).not.toBeNull();
    expect(linesProblem(paper(["36 ÷ 4 = 9 | q9@0", "9"]), whole("9"))).not.toBeNull();
    expect(linesProblem(paper(["4 × 9 = 36", "36 ÷ 4 = 9", "9"]), whole("9"))).toBeNull();
  });
});

describe("the working of a question with a bracket", () => {
  const steps = paper(ONE);
  const answer = answerOf("9 R1");
  const question = (change: Partial<WorkedQuestion>): WorkedQuestion => ({
    steps, answer, printed: { answer, steps, features: {}, widths: {} }, rows: ["□R□", "4)37"], kind: "bracket", answerKind: "whole-number", working: "division", ...change,
  });
  const details = (change: Partial<WorkedQuestion>) => stepProblems(question(change)).map((p) => `${p.check}: ${p.detail}`).join("\n");
  it.each<[string, Partial<WorkedQuestion>, RegExp | null]>([
    ["as a division", {}, null],
    ["as a division, on a line", { kind: "equation", rows: ["37÷4=□R□"] }, null],
    ["as a division with the steps of another dividend", { rows: ["□R□", "4)38"] }, /^steps-marks: the step .* must subtract 38 - 36$/],
    ["in columns", { working: "columns" }, /^steps-marks: a bracket is not worked in columns$/],
    ["in lines", { working: "lines" }, /^steps-marks: the step .* is not a text that draws nothing$/],
    ["as a division, in a stack", { kind: "column", rows: ["37", "-4"] }, /^steps-marks: a column stack must be worked in columns$/],
  ])("%s", (_name, change, message) => (message ? expect(details(change)).toMatch(message) : expect(details(change)).toBe("")));
});
