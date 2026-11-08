// Maya's lines for the parts of an evaluate question (Maya coverage Wave A, A2; evaluate.ts). Every number and
// expression is filled from the package's checked worked steps; the reason a part comes first is code's sentence
// (evaluate.ts, reasonOf). A part's column steps keep the existing column lines (lines.ts, stepLines) with the part's
// step ids; the first column of a part says the part first: what it is, why it comes now, and its question.
// Every wording is new and waits for Savar's approval (D-202).
import type { OperationPackage, WorkedStep } from "@/lib/question-package";
import { evaluateFrame, partAt, partPackage } from "./evaluate";
import type { LineId, LineOffer, Slots, TemplateKey } from "./lines";

export const EVALUATE_TEMPLATES = {
  // The first part (#A2): why it comes first, then its question. {reason} is code's sentence ("Multiply before you add.").
  "part.first": [
    "{reason} So start with {part}. What is it?", "{reason} So {part} comes first. What do you get?",
    "Let's start with {part}. {reason} What is it?", "{reason} First, work out {part}. What do you get?",
    "{reason} Can you work out {part} first?",
  ],
  // A part after the first: what the expression is now, why this part comes next, then its question.
  "part.next": [
    "Now we have {before}. {reason} What is {part}?", "We have {before} now. {reason} So next, {part}. What is it?",
    "Look at {before}. {reason} What is {part}?", "Now it's {before}. {reason} Can you work out {part}?",
    "Next, look at {before}. {reason} What do you get for {part}?",
  ],
  // The last part: one operation is all that is still to do.
  "part.last": [
    "Now we have {part}. What is it?", "Now it's just {part}. What do you get?", "We have {part} now. Can you work it out?",
    "Next, {part}. What is it?", "Now work out {part}. What do you get?",
  ],
  // The last part of a missing-number question ("9 × ? = 7650"): the inverse operation finds ?.
  "part.frame.divide": [
    "Now we have {equation}. To find the missing number, divide: {part}. What is it?",
    "Now it's {equation}. We find the missing number with {part}. What do you get?",
    "We have {equation}. So the missing number is {part}. What is it?",
    "Look at {equation}. To find the missing number, work out {part}.",
    "Now {equation}. Divide to find the missing number: {part}. What do you get?",
  ],
  "part.frame.subtract": [
    "Now we have {equation}. To find the missing number, subtract: {part}. What is it?",
    "Now it's {equation}. We find the missing number with {part}. What do you get?",
    "We have {equation}. So the missing number is {part}. What is it?",
    "Look at {equation}. To find the missing number, work out {part}.",
    "Now {equation}. Subtract to find the missing number: {part}. What do you get?",
  ],
  // Why this part comes first (step.order, H1), for a child who works another part first.
  "part.order": [
    "{reason} So {part} comes first.", "{reason} That is why {part} is first.", "{reason} So {part} goes first.",
    "{reason} We work out {part} before the rest.", "{reason} So we start with {part}.",
  ],
} as const satisfies Record<string, readonly string[]>;

type Offer = (line: LineId, key: TemplateKey, vars: Record<string, string | number>, extra: Omit<LineOffer, "line" | "texts" | "key">) => LineOffer;

/** An offer of the part's column line, under the step id of the child's question ("e1.r1-ones"). */
const reslot = (o: LineOffer, step: string): LineOffer => ({
  ...o,
  slots: { ...o.slots, step } as Slots,
  ...(o.requires ? { requires: { ...o.requires, step } } : {}),
});

/**
 * The help lines of a step of an evaluate question: null for any other question. A part's column step has the column's
 * own lines; the first column of a part has the part's question at H0 (in place of the column's invite), and why the
 * part comes now at H1 (step.order). The part's own step has no help: it is done with its columns (closeParts).
 */
export function partHelp(pkg: OperationPackage, step: WorkedStep, stepLines: (pkg: OperationPackage, step: WorkedStep) => LineOffer[], offer: Offer): LineOffer[] | null {
  const at = partAt(pkg, step.id);
  if (!at) return null;
  if (at.inner === null) return [];
  const { part } = at;
  const own = stepLines(partPackage(pkg, part), at.inner).map((o) => reslot(o, step.id));
  if (!at.first) return own;
  const slots = { step: step.id };
  const frame = part.last ? evaluateFrame(pkg) : null;
  const vars = { part: part.expr, before: part.before, reason: part.reason ?? "", equation: frame?.equation ?? "" };
  const index = Number(part.id.replace(/^e/, ""));
  const key: TemplateKey = frame ? (frame.verb === "divide" ? "part.frame.divide" : "part.frame.subtract")
    : part.last ? "part.last" : index === 1 ? "part.first" : "part.next";
  const invite = offer("step.invite", key, vars, { slots, level: 0, board: part.expr });
  const order = part.reason ? [offer("step.order", "part.order", vars, { slots, level: 1 })] : [];
  // The column's lines come before the order at H1, so a stuck child gets the part's column method first.
  return [invite, ...own.filter((o) => !(o.line === "step.invite" && o.level === 0)), ...order];
}

/** The equation of a step of an evaluate question ("9 × 880 = 7920", a column's "8 × 9 = 72"); undefined for others. */
export function partEquation(pkg: OperationPackage, step: WorkedStep, equationOf: (step: WorkedStep, pkg: OperationPackage, problem: "target" | "example") => string | null): string | null | undefined {
  if (step.kind === "operate") return `${step.left} ${step.op} ${step.right} = ${step.value}`;
  const at = partAt(pkg, step.id);
  return at?.inner ? equationOf(at.inner, partPackage(pkg, at.part), "target") : undefined;
}
