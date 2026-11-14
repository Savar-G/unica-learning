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
  // A part after the first: why this part comes next, then its question. Short: a part's numbers can take many words.
  "part.next": [
    "{reason} Next, {part}. What is it?", "Next is {part}. {reason} What do you get?", "{reason} So next, work out {part}.",
    "Now {part}. {reason} What is it?", "{reason} What is {part}?",
  ],
  // The last part: one operation is all that is still to do.
  "part.last": [
    "Now we have {part}. What is it?", "Now it's just {part}. What do you get?", "We have {part} now. Can you work it out?",
    "Next, {part}. What is it?", "Now work out {part}. What do you get?",
  ],
  // The last part of a missing-number question ("9 × ? = 7650"): the inverse operation finds ?.
  "part.frame.divide": [
    "Now {equation}. Divide to find it: {part}. What is it?", "We have {equation}. The missing number is {part}. What is it?",
    "Now {equation}. What is {part}?", "Look at {equation}. To find the missing number, work out {part}.",
    "Now {equation}. Find the missing number: {part}.",
  ],
  "part.frame.subtract": [
    "Now {equation}. Subtract to find it: {part}. What is it?", "We have {equation}. The missing number is {part}. What is it?",
    "Now {equation}. What is {part}?", "Look at {equation}. To find the missing number, work out {part}.",
    "Now {equation}. Find the missing number: {part}.",
  ],
  // Which part the help is on, said first in every help line of a part's first column (H1 to H3), so a child who
  // starts stuck hears which part the columns are for (brief, "Lessons from review", 2): its operation, and the board
  // shows its columns. Short, so a column line still fits a 25-word turn. Wording i leads the column line's wording i.
  "part.lead.first": ["First, {verb}.", "{Verb} first.", "Start: {verb}.", "First: {verb}.", "Begin: {verb}."],
  "part.lead.next": ["Next, {verb}.", "Then {verb}.", "{Verb} next.", "Next: {verb}.", "Now {verb}."],
  "part.lead.last": ["Now {verb}.", "Last, {verb}.", "{Verb} now.", "Then {verb}.", "Finally, {verb}."],
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
  if (!at.first || at.inner.kind === "try-factor") return own;
  const slots = { step: step.id };
  const frame = part.last ? evaluateFrame(pkg) : null;
  const verb = { "+": "add", "−": "subtract", "×": "multiply", "÷": "divide" }[part.step.op];
  const vars = { part: part.expr, before: part.before, reason: part.reason ?? "", equation: frame?.equation ?? "", verb, Verb: verb[0].toUpperCase() + verb.slice(1) };
  const index = Number(part.id.replace(/^e/, ""));
  const key: TemplateKey = frame ? (frame.verb === "divide" ? "part.frame.divide" : "part.frame.subtract")
    : part.last ? "part.last" : index === 1 ? "part.first" : "part.next";
  const invite = offer("step.invite", key, vars, { slots, level: 0, board: part.expr });
  const order = part.reason ? [offer("step.order", "part.order", vars, { slots, level: 1 })] : [];
  // Every help line of the column at H1 to H3 starts with which part it is for.
  const leadKey: TemplateKey = part.last ? "part.lead.last" : index === 1 ? "part.lead.first" : "part.lead.next";
  const leads = offer("step.order", leadKey, vars, { slots }).texts;
  const led = own.filter((o) => !(o.line === "step.invite" && o.level === 0)).map((o) => ({ ...o, texts: o.texts.map((t, i) => `${leads[i % leads.length]} ${t}`) }));
  // The column's lines come before the order at H1, so a stuck child gets the part's column method first.
  return [invite, ...led, ...order];
}

/** The equation of a step of an evaluate question ("9 × 880 = 7920", a column's "8 × 9 = 72"); undefined for others. */
export function partEquation(pkg: OperationPackage, step: WorkedStep, equationOf: (step: WorkedStep, pkg: OperationPackage, problem: "target" | "example") => string | null): string | null | undefined {
  if (step.kind === "operate") return `${step.left} ${step.op} ${step.right} = ${step.value}`;
  const at = partAt(pkg, step.id);
  return at?.inner ? equationOf(at.inner, partPackage(pkg, at.part), "target") : undefined;
}

/**
 * A part of an evaluate expression shown in words, for the easier example and H3, short enough for a 25-word turn:
 * "Multiply first: 2 × 30 = 60. Now 60 + 2 × 4.", "Brackets first: 20 − 4 = 16. Now 16 ÷ 8.", "Then add: 60 + 8 = 68."
 * The order word is code's: brackets, then × and ÷ before + and −. Null for any other step.
 */
export function partShow(step: WorkedStep): string | null {
  if (step.kind !== "operate") return null;
  const eq = `${step.left} ${step.op} ${step.right} = ${step.value}`;
  const plusMinus = /[+−]/.test(step.rest);
  const lead = step.rule === "brackets" ? "Brackets first"
    : step.rule === "multiply-divide" ? (plusMinus ? `${step.op === "×" ? "Multiply" : "Divide"} first` : `Then ${step.op === "×" ? "multiply" : "divide"}`)
      : `Then ${step.op === "+" ? "add" : "subtract"}`;
  const now = step.rest === String(step.value) ? "" : ` Now ${step.rest}.`;
  return `${lead}: ${eq}.${now}`;
}
