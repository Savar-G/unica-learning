import {
  NOT_STATED,
  UNCLEAR,
  type ArithOp,
  type Example,
  type Expr,
  type PageItem,
  type ReferenceRecord,
} from "@/lib/reference-record";
import { isConcreteAnswer, plainMinus } from "./answer-text";
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

function toNumber(text: string): number {
  return Number(text.replace(/,/g, "")) + 0;
}

function parseChain(text: string): PrintedLine | null {
  if (!CHAIN_RE.test(text)) return null;
  const terms = text
    .split(/\s*(?:,\s+|→)\s*/)
    .map((term) => (/\d/.test(term) ? toNumber(term) : null));
  return terms.includes(null) ? { kind: "chain", terms } : null;
}

// Takes a printed line only when the whole line is: whole or decimal numbers and blanks joined by
// one and the same sign (+, -, ×, ÷), with an optional "=" that a blank or one number may follow; a
// chain of numbers and blanks; or, for a division bracket, "divisor) dividend".
export function parsePrintedLine(raw: string, form?: PageItem["form"]): PrintedLine | null {
  const text = plainMinus(raw).trim();
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
  if (rest === "") return operands.includes(null) ? null : { kind: "equation", op, operands, end: "none" };
  const end = END_RE.exec(rest);
  if (!end) return null;
  return { kind: "equation", op, operands, end: end[1] === undefined ? "open" : { value: end[1] } };
}

// The expressions that say what a printed line says. A line that is printed already solved also
// fits the equation with any one of its numbers as the blank.
function exprsOfLine(line: PrintedLine, stored: Expr): Expr[] {
  if (line.kind === "chain") {
    const step = stored.kind === "chain" ? stored.step : undefined;
    return [{ kind: "chain", terms: line.terms, ...(step === undefined ? {} : { step }) }];
  }
  const { op, operands, end } = line;
  const value = typeof end === "object" && /^[^rR]*$/.test(end.value) ? toNumber(end.value) : null;
  if (operands.includes(null)) return [{ kind: "missing", op, operands, result: value }];
  return [
    { kind: "arith", op, operands: operands as number[] },
    { kind: "missing", op, operands, result: null },
    ...(value === null
      ? []
      : operands.map((_, blank): Expr => ({
          kind: "missing",
          op,
          operands: operands.map((n, i) => (i === blank ? null : n)),
          result: value,
        }))),
  ];
}

function hasSentinel(value: unknown): boolean {
  if (value === UNCLEAR || value === NOT_STATED) return true;
  return typeof value === "object" && value !== null && Object.values(value).some(hasSentinel);
}

function lineOfLatex(latex: string): PrintedLine | null {
  return parsePrintedLine(
    latex
      .replace(/\\times(?![A-Za-z])/g, "×")
      .replace(/\\div(?![A-Za-z])/g, "÷")
      .replace(/\s*=\s*$/, ""),
  );
}

function sameSides(a: PrintedLine, b: PrintedLine): boolean {
  if (a.kind === "chain" || b.kind === "chain") {
    return a.kind === b.kind && JSON.stringify(a) === JSON.stringify(b);
  }
  return a.op === b.op && JSON.stringify(a.operands) === JSON.stringify(b.operands);
}

export type LineVerdict = "match" | "differs" | "unknown";

// Whether a printed line and a stored expression have the same structure. "unknown" when the stored
// expression is one that the parser cannot take.
export function compareLineWithExpr(line: PrintedLine, expr: Expr): LineVerdict {
  if (expr.kind === "word") {
    if (expr.expr === null) return "differs";
    return typeof expr.expr === "string" ? "unknown" : compareLineWithExpr(line, expr.expr);
  }
  if (hasSentinel(expr)) return "unknown";
  if (expr.kind === "notation") {
    const latexLine = lineOfLatex(expr.latex);
    if (latexLine === null) return "unknown";
    return sameSides(line, latexLine) ? "match" : "differs";
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

function conflict(path: string, printed: string, exprs: ReadonlyArray<Expr | null>): AnswerNote {
  const held = exprs.map((e) => `"${exprText(e)}"`).join(" or ");
  return {
    kind: "printed_differs",
    path,
    message: `${path}: page prints "${printed}", expression is ${held}`,
  };
}

// A line that asks for an answer: it ends with "=" or has a blank.
function isOpenLine(line: PrintedLine): boolean {
  return line.kind === "chain" || line.end === "open" || line.operands.includes(null);
}

function itemConflict(item: PageItem, path: string): AnswerNote[] {
  if (!isConcreteAnswer(item.printed)) return [];
  const line = parsePrintedLine(item.printed, item.form);
  if (line === null) return [];
  const differs =
    item.expr === null
      ? isOpenLine(line) || item.responses.some((resp) => isConcreteAnswer(resp.answer))
      : compareLineWithExpr(line, item.expr) === "differs";
  return differs ? [conflict(`${path}.printed`, item.printed, [item.expr])] : [];
}

// The printed lines of a worked example are its setup steps. Each one belongs to a part of its own
// when there are as many as parts; otherwise only the first line of the working is checked.
function exampleConflicts(example: Example, path: string): AnswerNote[] {
  if (!Array.isArray(example.steps)) return [];
  const setups = example.steps.filter((step) => step.shows === "setup");
  const checked =
    setups.length === example.parts.length ? setups : example.steps.slice(0, 1).filter((s) => s.shows === "setup");
  const exprs = example.parts.map((part) => part.expr);
  const form = example.parts.every((part) => part.form === "bracket") ? "bracket" : null;
  const free = new Set(exprs.keys());
  const out: AnswerNote[] = [];
  for (const step of checked) {
    if (!isConcreteAnswer(step.printed)) continue;
    const line = parsePrintedLine(step.printed, form);
    if (line === null) continue;
    const verdicts = new Map<number, LineVerdict>();
    for (const idx of free) {
      const expr = exprs[idx];
      verdicts.set(idx, expr === null ? "unknown" : compareLineWithExpr(line, expr));
    }
    const found = [...free].find((idx) => verdicts.get(idx) === "match");
    if (found !== undefined) free.delete(found);
    else if (![...verdicts.values()].includes("unknown")) {
      out.push(conflict(`${path}.steps[n=${step.n}].printed`, step.printed, exprs));
    }
  }
  return out;
}

// Printed lines that do not say what the stored expression says. Lines and expressions that the
// parser does not take completely are never listed.
export function findPrintedConflicts(record: ReferenceRecord | null | undefined): AnswerNote[] {
  if (!record || record.kind !== "page") return [];
  const items = record.sections.flatMap((section, si) =>
    section.items.flatMap((item) => itemConflict(item, itemPathOf(si, item))),
  );
  const examples = Array.isArray(record.examples) ? record.examples : [];
  return [...items, ...examples.flatMap((ex, ei) => exampleConflicts(ex, `examples[${ei}]`))];
}
