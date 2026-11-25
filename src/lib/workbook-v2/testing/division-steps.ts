// What the steps of a division must be, whatever the shape: it starts from the printed dividend and divisor and works on
// the paper. Each digit of the dividend is used one time from the left, each quotient digit is the largest that fits, and
// each step says and draws exactly what comes next.
import type { Answer, Step, StepMark } from "../contract";
import { canonicalJson } from "../hash";
import { hasNames, type Rows } from "./shape-registration";
import { clauseOf, multipleOf, parseStep, type ParsedStep } from "./steps-evaluator";

const WORK_MARKS: readonly StepMark["mark"][] = ["product", "rest", "bring-down"];

function isDivisionMark(mark: StepMark): boolean {
  if (!hasNames(mark, ["mark", "row", "place", "digit"]) || !("row" in mark) || !Number.isSafeInteger(mark.row) || !Number.isSafeInteger(mark.place)) return false;
  if (mark.place < 0 || typeof mark.digit !== "string" || !/^\d$/.test(mark.digit)) return false;
  return mark.mark === "quotient" ? mark.row === 0 : WORK_MARKS.includes(mark.mark) && Number(mark.row) > 0;
}

/** The printed numbers, and how many answer areas are printed. */
interface Printed { dividend: string; divisor: number; areas: number }

function printedOf(rows: Rows): Printed | null {
  const text = rows.join("\n");
  const line = /^(0|[1-9]\d*)÷([1-9]\d*)=□(R□)?$/.exec(text);
  if (line) return { dividend: line[1], divisor: Number(line[2]), areas: line[3] ? 2 : 1 };
  const bracket = /^□(R□)?\n([1-9]\d*)\)(0|[1-9]\d*)$/.exec(text);
  return bracket && { dividend: bracket[3], divisor: Number(bracket[2]), areas: bracket[1] ? 2 : 1 };
}

const atRow = (mark: "quotient" | "product" | "rest" | "bring-down", row: number, place: number, digit: string | number): StepMark => ({ mark, row, place, digit: String(digit) });

/** The paper of one division, from the first digit of the dividend to the last one. */
class Paper {
  /** How many digits of the dividend are used. */
  private used = 1;
  /** The number that is divided now. */
  private part: number;
  /** The product that is written under it, when the digit of the quotient is there and what is left is not. */
  private product: number | null = null;
  private row = 0;
  quotient = "";
  /** What is left after the last digit, when it is worked. */
  last: number | null = null;

  /** Two digits that are the whole dividend are used together with no word. */
  constructor(private readonly dividend: string, private readonly divisor: number) {
    if (dividend.length === 2 && Number(dividend[0]) < divisor) this.used = 2;
    this.part = Number(dividend.slice(0, this.used));
  }

  private get place(): number { return this.dividend.length - this.used; }

  /** The digits of the dividend must be used, and what is left of the last one must be there. */
  endProblem(): string | null {
    if (this.last !== null) return null;
    return this.product === null ? `the steps end and the digits of ${this.part} are not worked` : `the steps end and no step says what is left of ${this.part}`;
  }

  /** What is wrong with the next step, or null. It changes the paper. */
  next({ clauses }: ParsedStep, marks: readonly StepMark[]): string | null {
    const { part, divisor, dividend } = this;
    if (this.last !== null) return "comes after its last digit";
    if (this.product !== null) return this.subtract(clauses, marks, this.product);
    if (part >= divisor) return this.estimate(clauses, marks);
    const less = clauseOf(clauses, "less");
    const isFirst = this.quotient === "" && dividend.length > this.used;
    const wanted = `${part} is less than ${divisor}${isFirst ? `, use ${part}${dividend[this.used]}` : ", write 0"}`;
    if (!less || less.part !== part || less.divisor !== divisor || (clauseOf(clauses, "use") !== undefined) !== isFirst) return `must say "${wanted}"`;
    if (isFirst) {
      const use = clauseOf(clauses, "use");
      this.part = Number(dividend.slice(0, ++this.used));
      return use?.part === this.part ? this.drawn(marks, []) : `must say "use ${this.part}"`;
    }
    this.quotient += "0";
    return this.goOn(clauses, marks, [atRow("quotient", 0, this.place, 0)], part);
  }

  private estimate(clauses: ParsedStep["clauses"], marks: readonly StepMark[]): string | null {
    const { part, divisor, place } = this;
    const [equation, tooMuch] = [clauseOf(clauses, "equation"), clauseOf(clauses, "too-much")];
    const multiple = equation && multipleOf(equation.left);
    if (!multiple || !tooMuch) return `must estimate how many times ${divisor} fits into ${part}`;
    if (multiple.divisor !== divisor) return `must multiply ${divisor}, and it multiplies ${multiple.divisor}`;
    const product = divisor * multiple.times;
    if (product > part) return `says ${equation.text}, and ${product} is more than ${part}`;
    if (tooMuch.value <= part) return `says ${tooMuch.text}, and ${tooMuch.value} is not more than ${part}`;
    if (multiple.times > 9) return `has ${multiple.times} at one place`;
    this.quotient += String(multiple.times);
    this.product = product;
    this.row += 1;
    const digits = [...String(product)];
    return this.drawn(marks, [atRow("quotient", 0, place, multiple.times), ...digits.map((digit, i) => atRow("product", this.row, place + digits.length - 1 - i, digit))]);
  }

  private subtract(clauses: ParsedStep["clauses"], marks: readonly StepMark[], product: number): string | null {
    const equation = clauseOf(clauses, "equation");
    const rest = this.part - product;
    if (equation?.left !== `${this.part} - ${product}`) return `must subtract ${this.part} - ${product}`;
    if (clauses.some((c) => !["equation", "bring-down", "now"].includes(c.kind))) return "must say only what is left";
    this.product = null;
    this.row += 1;
    return this.goOn(clauses, marks, [atRow("rest", this.row, this.place, rest)], rest);
  }

  /** After a digit of the quotient is worked: the next digit of the dividend comes down, or the division ends. */
  private goOn(clauses: ParsedStep["clauses"], marks: readonly StepMark[], drawn: StepMark[], rest: number): string | null {
    const down = clauseOf(clauses, "bring-down");
    if (this.used === this.dividend.length) {
      this.last = rest;
      return down ? `brings down ${down.digit}, and the dividend has no digit left` : this.drawn(marks, drawn);
    }
    const digit = Number(this.dividend[this.used]);
    if (down?.digit !== digit) return `must say "bring down ${digit}"`;
    this.used += 1;
    this.part = rest * 10 + digit;
    return this.drawn(marks, [...drawn, atRow("bring-down", this.row, this.place, digit)]);
  }

  private drawn(marks: readonly StepMark[], wanted: readonly StepMark[]): string | null {
    return canonicalJson(marks) === canonicalJson(wanted) ? null : `has the marks ${canonicalJson(marks)} and must have ${canonicalJson(wanted)}`;
  }
}

/** What is wrong with the steps of a question that is worked as a division, or null. `rows` are its printed rows. */
export function divisionProblem(steps: readonly Step[], { parts }: Answer, rows: Rows): string | null {
  for (const step of steps) {
    if (!hasNames(step, ["text", "marks"]) || !Array.isArray(step.marks)) return `the step ${JSON.stringify(step)} is not a text with marks`;
    if (!step.marks.every(isDivisionMark)) return `the step "${step.text}" holds a mark that is not one`;
  }
  if (steps.at(-1)?.marks.length !== 0) return "the last step draws something";
  const printed = printedOf(rows);
  if (!printed) return `the printed rows ${JSON.stringify(rows)} are no division`;
  if (printed.areas !== parts.length) return `the printed rows have ${printed.areas} areas and the answer ${parts.length} parts`;
  const paper = new Paper(printed.dividend, printed.divisor);
  for (const { text, marks } of steps.slice(0, -1)) {
    const read = parseStep(text);
    if (read.problem) return `the step "${text}": ${read.problem}`;
    const problem = paper.next(read, marks);
    if (problem) return `the step "${text}" ${problem}`;
  }
  const end = paper.endProblem();
  if (end) return end;
  const [quotient, remainder] = parts.map((p) => p.value);
  if (paper.quotient !== quotient) return `the paper writes "${paper.quotient}" and the answer is "${quotient}"`;
  if (parts.length === 1) return paper.last === 0 ? null : `${paper.last} is left over and the answer has no part for it`;
  return String(paper.last) === remainder ? null : `${paper.last} is left over and the remainder is "${remainder}"`;
}
