import {
  computeExprAnswer,
  NOT_STATED,
  UNCLEAR,
  type ArithOp,
  type Example,
  type ExamplePart,
  type Expr,
  type PageItem,
  type PageSection,
  type ReferenceRecord,
  type SimpleExpr,
} from "@/lib/reference-record";
import { isConcreteAnswer, plainMinus, sameValue } from "./answer-text";
import { itemPathOf, type AnswerNote } from "./answers";
import { compareExpr, type RecordDifference } from "./compare-parts";

// A printed line that the parser takes completely. `end` is what stands after the operands:
// nothing, "=" with nothing or a blank ("open"), or "=" with one number.
export type PrintedLine =
  | { kind: "equation"; op: ArithOp; operands: Array<number | null>; end: "none" | "open" | { value: string } }
  | { kind: "chain"; terms: Array<number | null> };

const OP_BY_SIGN: Record<string, ArithOp> = {
  "+": "add",
  "-": "sub",
  "×": "mul",
  "∗": "mul",
  "*": "mul",
  x: "mul",
  X: "mul",
  "÷": "div",
};
const SIGN_BY_OP: Record<ArithOp, string> = { add: "+", sub: "-", mul: "×", div: "÷" };

const NUMBER = String.raw`-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const BLANK = String.raw`(?:□(?:\s*□)*|_{2,})`;
const OPERAND = `(?:${NUMBER}|${BLANK})`;
const OPERAND_RE = new RegExp(`^(?:(${NUMBER})|${BLANK})`);
const OP_RE = /^(?:\s*([+\-×∗*÷])\s*|\s+([xX])\s+)/;
const END_RE = new RegExp(`^\\s*=\\s*(?:(${NUMBER}(?:\\s*[rR]\\s*\\d+)?)|${BLANK}(?:\\s*[rR]\\s*${BLANK})?)?$`);
const CHAIN_RE = new RegExp(`^${OPERAND}(?:\\s*(?:,\\s+|\\u2192)\\s*${OPERAND})+$`);
const BRACKET_RE = /^(\d+)\s*\)\s*(\d+)$/;
const DATE_RE = /^\d{1,4}([-/.])\d{1,2}\1\d{1,4}$/;
// A longer number would lose digits.
const LONG_NUMBER_RE = /\d(?:[,.]?\d){15}/;

function toNumber(text: string): number {
  return Number(text.replace(/,/g, "")) + 0;
}

function parseChain(text: string): PrintedLine | null {
  if (!CHAIN_RE.test(text)) return null;
  const terms = text
    .split(/\s*(?:,\s+|→)\s*/)
    .map((term) => (/\d/.test(term) ? toNumber(term) : null));
  return terms.length > 2 && terms.includes(null) ? { kind: "chain", terms } : null;
}

// Takes a printed line only when the whole line is: whole or decimal numbers and blanks joined by
// one and the same sign (+, -, ×, ÷), then "=" that a blank or one number may follow; the same with
// no "=" and no blank when the form is vertical or bracket; a chain of three or more numbers and
// blanks; or, for a division bracket, "divisor) dividend". Never a date.
export function parsePrintedLine(raw: string, form?: PageItem["form"]): PrintedLine | null {
  const text = plainMinus(raw).trim();
  if (DATE_RE.test(text) || LONG_NUMBER_RE.test(text)) return null;
  const bracket = form === "bracket" ? BRACKET_RE.exec(text) : null;
  if (bracket) {
    return { kind: "equation", op: "div", operands: [toNumber(bracket[2]), toNumber(bracket[1])], end: "none" };
  }
  const operands: Array<number | null> = [];
  let op: ArithOp | null = null;
  let rest = text;
  for (;;) {
    const operand = OPERAND_RE.exec(rest);
    if (!operand) return null;
    operands.push(operand[1] === undefined ? null : toNumber(operand[1]));
    rest = rest.slice(operand[0].length);
    const sign = OP_RE.exec(rest);
    if (!sign) break;
    const next = OP_BY_SIGN[sign[1] ?? sign[2]];
    if (op !== null && next !== op) return null;
    op = next;
    rest = rest.slice(sign[0].length);
  }
  if (op === null) return parseChain(text);
  if (rest === "") {
    const stacked = form === "vertical" || form === "bracket";
    return stacked && !operands.includes(null) ? { kind: "equation", op, operands, end: "none" } : null;
  }
  const end = END_RE.exec(rest);
  if (!end) return null;
  return { kind: "equation", op, operands, end: end[1] === undefined ? "open" : { value: end[1] } };
}

function resultOf(line: PrintedLine): string | null {
  return line.kind === "equation" && typeof line.end === "object" ? line.end.value : null;
}

// The expression of a line: what it asks for, with no result when nothing is left out on its left.
export function exprOfLine(line: PrintedLine): SimpleExpr {
  if (line.kind === "chain") return { kind: "chain", terms: line.terms };
  const { op, operands } = line;
  if (!operands.includes(null)) return { kind: "arith", op, operands: operands as number[] };
  const result = resultOf(line);
  return { kind: "missing", op, operands, result: result === null || /r/i.test(result) ? null : toNumber(result) };
}

// The value of the left side of a line, when the line prints another result. Null when the result
// is right, or when there is none, or when code cannot compute it (a decimal result of a division).
export function wrongResult(line: PrintedLine): string | null {
  const result = resultOf(line);
  const computed = result === null ? null : computeExprAnswer(exprOfLine(line));
  if (result === null || computed?.kind !== "single" || exprOfLine(line).kind !== "arith") return null;
  if ((computed.remainder ?? 0) > 0 && result.includes(".")) return null;
  return sameValue(result, computed.value) ? null : computed.value;
}

// The expressions that say what a printed line says. A line that is printed already solved also
// fits the equation with any one of its numbers as the blank.
function exprsOfLine(line: PrintedLine, stored: Expr): Expr[] {
  const own = exprOfLine(line);
  if (line.kind === "chain") {
    const step = stored.kind === "chain" ? stored.step : undefined;
    return [step === undefined ? own : { ...own, step } as Expr];
  }
  if (own.kind === "missing") return [own];
  const { op, operands } = line;
  const result = resultOf(line);
  const solved = result === null || /r/i.test(result) ? null : toNumber(result);
  return [
    own,
    { kind: "missing", op, operands, result: null },
    ...(solved === null
      ? []
      : operands.map((_, blank): Expr => ({
          kind: "missing",
          op,
          operands: operands.map((n, i) => (i === blank ? null : n)),
          result: solved,
        }))),
  ];
}

function hasSentinel(value: unknown): boolean {
  if (value === UNCLEAR || value === NOT_STATED) return true;
  return typeof value === "object" && value !== null && Object.values(value).some(hasSentinel);
}

export function lineOfLatex(latex: string): PrintedLine | null {
  const text = latex
    .replace(/\\times(?![A-Za-z])/g, "\u00D7")
    .replace(/\\div(?![A-Za-z])/g, "\u00F7")
    .replace(/\\(?:square|Box)(?![A-Za-z])/g, "\u25A1")
    .replace(/\s*=\s*$/, "");
  return parsePrintedLine(text, "vertical");
}

export type LineVerdict = "match" | "differs" | "unknown";

// Two lines: the same numbers, blanks and sign, and no result that one of them does not bear out.
function compareLines(a: PrintedLine, b: PrintedLine): LineVerdict {
  if (JSON.stringify(exprSides(a)) !== JSON.stringify(exprSides(b))) return "differs";
  const [resultA, resultB] = [resultOf(a), resultOf(b)];
  if (resultA === null && resultB === null) return "match";
  if (resultA !== null && resultB !== null) return sameValue(resultA, resultB) ? "match" : "differs";
  if (exprOfLine(a).kind !== "arith") return "differs";
  return wrongResult(a) === null && wrongResult(b) === null ? "match" : "differs";
}

function exprSides(line: PrintedLine): unknown[] {
  return line.kind === "chain" ? line.terms : [line.op, ...line.operands];
}

// Whether a printed line and a stored expression say the same. "unknown" when the stored
// expression is one that the parser cannot take.
export function compareLineWithExpr(line: PrintedLine, expr: Expr): LineVerdict {
  if (expr.kind === "word") {
    if (expr.expr === null) return "differs";
    return typeof expr.expr === "string" ? "unknown" : compareLineWithExpr(line, expr.expr);
  }
  if (hasSentinel(expr)) return "unknown";
  if (expr.kind === "notation") {
    const latexLine = lineOfLatex(expr.latex);
    return latexLine === null ? "unknown" : compareLines(line, latexLine);
  }
  const same = exprsOfLine(line, expr).some((candidate) => {
    const diffs: RecordDifference[] = [];
    compareExpr("expr", candidate, expr, diffs);
    return diffs.length === 0;
  });
  return same ? "match" : "differs";
}

function sideText(values: ReadonlyArray<unknown>, joint: string): string {
  return values.map((v) => (v === null ? "□" : String(v))).join(joint);
}

function exprText(expr: Expr | null): string {
  if (expr === null) return "none";
  switch (expr.kind) {
    case "arith":
    case "missing": {
      const sign = SIGN_BY_OP[expr.op as ArithOp] ?? String(expr.op);
      const left = sideText(expr.operands, ` ${sign} `);
      return expr.kind === "arith" ? left : `${left} = ${sideText([expr.result], "")}`;
    }
    case "chain":
      return sideText(expr.terms, ", ");
    case "linked":
      return expr.pair.map(exprText).join(" and ");
    case "word":
      return typeof expr.expr === "string" ? expr.expr : exprText(expr.expr);
    case "notation":
      return expr.latex;
  }
}

function note(path: string, message: string): AnswerNote {
  return { kind: "printed_differs", path, message: `${path}: ${message}` };
}

function differs(path: string, printed: string, exprs: ReadonlyArray<Expr | null>): AnswerNote {
  const held = exprs.map((e) => `"${exprText(e)}"`).join(" or ");
  return note(path, `page prints "${printed}", expression is ${held}`);
}

// The printed line of an item, when the parser takes it. A row of a table that is read aloud asks
// for no answer, so it is never taken.
export function itemLine(item: PageItem, section: PageSection): PrintedLine | null {
  if (!isConcreteAnswer(item.printed)) return null;
  const readAloud =
    Array.isArray(section.scaffolds) &&
    section.scaffolds.some(
      (sc) =>
        sc.kind === "table_read_aloud" && (!Array.isArray(sc.applies_to) || sc.applies_to.includes(item.n)),
    );
  return readAloud ? null : parsePrintedLine(item.printed, item.form);
}

// A taken line with no expression is a lost question when it asks for something: it is not printed
// already solved.
function isLostQuestion(line: PrintedLine): boolean {
  return resultOf(line) === null || exprOfLine(line).kind === "missing";
}

function itemConflict(item: PageItem, section: PageSection, path: string): AnswerNote[] {
  const line = itemLine(item, section);
  if (line === null) return [];
  const computed = wrongResult(line);
  if (computed !== null) return [note(path, `page prints "${item.printed}", computed "${computed}"`)];
  const noExpr = item.expr === null || (item.expr.kind === "word" && item.expr.expr === null);
  const wrong = noExpr
    ? isLostQuestion(line)
    : item.expr !== null && compareLineWithExpr(line, item.expr) === "differs";
  return wrong ? [differs(path, item.printed, [item.expr])] : [];
}

// An expression that a setup line can be compared with.
function isComparable(expr: Expr | null): expr is Expr {
  if (expr === null || hasSentinel(expr)) return false;
  if (expr.kind === "word") return typeof expr.expr === "object" && isComparable(expr.expr);
  if (expr.kind === "notation") return lineOfLatex(expr.latex) !== null;
  return expr.kind !== "linked" || expr.pair.every(isComparable);
}

export function setupLine(printed: unknown, form: ExamplePart["form"]): PrintedLine | null {
  return isConcreteAnswer(printed) ? parsePrintedLine(printed, form) : null;
}

// The printed lines of a worked example are its setup steps. Each one must say what one of the
// parts says (read in the form of that part). Not checked when code cannot read every part.
function exampleConflicts(example: Example, path: string): AnswerNote[] {
  if (!Array.isArray(example.steps) || example.relation === "table") return [];
  const exprs = example.parts.map((part) => part.expr);
  if (!exprs.every(isComparable)) return [];
  const targets = example.parts.flatMap((part) =>
    part.expr?.kind === "linked"
      ? part.expr.pair.map((expr): { expr: Expr; form: ExamplePart["form"] } => ({ expr, form: part.form }))
      : part.expr
        ? [{ expr: part.expr, form: part.form }]
        : [],
  );
  return example.steps.flatMap((step) => {
    if (step.shows !== "setup") return [];
    const at = `${path}.steps[n=${step.n}].printed`;
    const taken = targets.flatMap(({ expr, form }) => {
      const line = setupLine(step.printed, form);
      return line ? [{ expr, line }] : [];
    });
    if (taken.length === 0) return [];
    const computed = wrongResult(taken[0].line);
    if (computed !== null) return [note(at, `page prints "${step.printed}", computed "${computed}"`)];
    const said = taken.some(({ expr, line }) => compareLineWithExpr(line, expr) === "match");
    return said ? [] : [differs(at, String(step.printed), exprs)];
  });
}

// Printed lines that do not say what the stored expression says, or that print a wrong result.
// Lines and expressions that the parser does not take completely are never listed.
export function findPrintedConflicts(record: ReferenceRecord | null | undefined): AnswerNote[] {
  if (!record || record.kind !== "page") return [];
  const items = record.sections.flatMap((section, si) =>
    section.items.flatMap((item) => itemConflict(item, section, `${itemPathOf(si, item)}.printed`)),
  );
  const examples = Array.isArray(record.examples) ? record.examples : [];
  return [...items, ...examples.flatMap((ex, ei) => exampleConflicts(ex, `examples[${ei}]`))];
}

// The one exact answer (or chain of answers) that a line has, as an expression: for an item or a
// worked part that stores its question as notation or not at all.
export function exprWithExactAnswer(line: PrintedLine): SimpleExpr | null {
  const expr = exprOfLine(line);
  const computed = computeExprAnswer(expr);
  return computed && !(computed.kind === "single" && (computed.remainder ?? 0) > 0) ? expr : null;
}
