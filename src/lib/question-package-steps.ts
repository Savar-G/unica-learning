// Code-written solving steps for a question filled from a step template (#971), for the parent explanation (#675).
// The steps come from the question's stored template source (#489): the same sampled numbers, derived values and answer
// expression the checker recomputes, never the printed words. Each arithmetic operation becomes one line ("2 × 10 = 20"),
// innermost first; a missing number is found by undoing the operation it was taken from ("35 − 12 = 23"); a choice made
// by a comparison shows the comparison. The last line ends at the stored answer, or there are no steps at all.
// Derived only when an explanation is asked for: nothing is stored, and a printed book is never rendered again (#536).
// Pure TypeScript: no Next.js, React, network, database or clock.
import { decimalValue, compileExpression, evaluateTree, EvaluationBudget, expressionIsTrue, formatValue, FractionValue,
  type ExpressionNode, type ExpressionValue } from "@/lib/workbook-curriculum/expression";
import { templateAnswer, type TemplateScalar, type TemplateSource } from "@/lib/question-package-template";
import type { QuestionPackage } from "@/lib/question-package";

/** At most this many steps: a longer working is not a short explanation. */
export const MOST_TEMPLATE_STEPS = 8;

type Values = Record<string, ExpressionValue>;
interface Work { values: Values; clean: Map<string, ExpressionNode>; budget: EvaluationBudget; steps: string[]; text: string }

const SYMBOL: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷", "//": "÷" };
const COMPARE: Record<string, string> = { "<": "<", ">": ">", "<=": "≤", ">=": "≥", "==": "=", "!=": "≠" };
const PLACES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands", "millions"];

function scalar(s: TemplateScalar, budget: EvaluationBudget): ExpressionValue {
  if ("int" in s) return BigInt(s.int);
  if ("dec" in s) return decimalValue(s.dec, budget);
  return s.text;
}
const isNumber = (v: ExpressionValue) => typeof v === "bigint" || typeof v === "number" || v instanceof FractionValue;
const show = (v: ExpressionValue, w: Work) => formatValue(v, w.budget);
const value = (n: ExpressionNode, w: Work) => evaluateTree(n, w.values, w.budget);

/** Names a node reads. */
function names(n: ExpressionNode, out = new Set<string>()): Set<string> {
  if (n.kind === "name") out.add(n.name);
  for (const part of Object.values(n)) {
    if (part && typeof part === "object" && "kind" in part) names(part as ExpressionNode, out);
    else if (Array.isArray(part)) for (const p of part) {
      if (p && typeof p === "object") names(("kind" in p ? p : p.right) as ExpressionNode, out);
    }
  }
  return out;
}
/** Plain arithmetic of names and numbers: + − × and brackets only. A sampling rule ("2 + a0 % 20") is not. */
function plainArithmetic(n: ExpressionNode): boolean {
  if (n.kind === "name") return true;
  if (n.kind === "value") return isNumber(n.value);
  return n.kind === "binary" && ["+", "-", "*"].includes(n.op) && plainArithmetic(n.left) && plainArithmetic(n.right);
}
const powerOfTen = (v: ExpressionValue) => typeof v === "bigint" && v > BigInt(0) && /^10*$/.test(v.toString());

/** A number written from its digits ("100 * h + 10 * t + o"): each digit's name and place, or null. */
function placeTerms(n: ExpressionNode, w: Work): { name: string; place: bigint }[] | null {
  const terms = termsOf(n);
  const digit = (x: string) => typeof w.values[x] === "bigint" && (w.values[x] as bigint) >= BigInt(0) && (w.values[x] as bigint) <= BigInt(9);
  return terms && terms.length >= 2 && terms.some(t => t.place > BigInt(1)) && terms.every(t => digit(t.name))
    && new Set(terms.map(t => t.place)).size === terms.length ? terms : null;
}
function termsOf(n: ExpressionNode): { name: string; place: bigint }[] | null {
  if (n.kind === "name") return [{ name: n.name, place: BigInt(1) }];
  if (n.kind !== "binary") return null;
  if (n.op === "+") { const l = termsOf(n.left), r = termsOf(n.right); return l && r ? [...l, ...r] : null; }
  if (n.op !== "*") return null;
  const [k, x] = n.left.kind === "value" ? [n.left.value, n.right] : [n.right.kind === "value" ? n.right.value : null, n.left];
  return k !== null && powerOfTen(k) && BigInt(k as bigint) > BigInt(1) && x.kind === "name" ? [{ name: x.name, place: k as bigint }] : null;
}
const placeName = (place: bigint) => PLACES[place.toString().length - 1];

/**
 * The value of a node, writing one step for each operation inside it. At the answer's own place (the answer, or a
 * branch the answer takes) a bare name with no working of its own is found by undoing the value it was used in.
 */
function forward(n: ExpressionNode, w: Work, top = false): ExpressionValue {
  switch (n.kind) {
    case "name": {
      const tree = w.clean.get(n.name);
      if (tree && tree.kind !== "name" && !placeTerms(tree, w)) return forward(tree, w);
      // A number the question already prints is chosen, not found: undoing a value to reach it would mislead.
      if (top && !printed(w.text, show(value(n, w), w))) undo(n.name, w);
      return value(n, w);
    }
    case "binary": {
      // The digit in one place: n // 1000 % 10.
      if (n.op === "%" && n.right.kind === "value" && n.right.value === BigInt(10) && n.left.kind === "binary" && n.left.op === "//") {
        const whole = forward(n.left.left, w), place = forward(n.left.right, w);
        if (powerOfTen(place)) {
          const digit = value(n, w), at = place.toString().length - 1;
          if (at < PLACES.length) { w.steps.push(`The ${PLACES[at]} digit of ${show(whole, w)} is ${show(digit, w)}.`); return digit; }
        }
      }
      if (n.op === "and" || n.op === "or") return value(n, w);
      // Words joined together ("4 by 6", "3:05") are written, not worked: no steps from inside them.
      if (typeof value(n, w) === "string") return value(n, w);
      const l = forward(n.left, w), r = forward(n.right, w), out = value(n, w);
      if (!isNumber(l) || !isNumber(r)) return out;
      if (SYMBOL[n.op]) {
        if (n.op === "//") {
          const rest = evaluateTree({ kind: "binary", op: "%", left: { kind: "value", value: l }, right: { kind: "value", value: r } }, {}, w.budget);
          w.steps.push(`${show(l, w)} ÷ ${show(r, w)} = ${show(out, w)}${expressionIsTrue(rest) ? ` remainder ${show(rest, w)}` : ""}`);
        } else w.steps.push(`${show(l, w)} ${SYMBOL[n.op]} ${show(r, w)} = ${show(out, w)}`);
      } else if (n.op === "%") w.steps.push(`${show(l, w)} ÷ ${show(r, w)} leaves ${show(out, w)} left over`);
      return out;
    }
    case "call": {
      const args = n.args.map(a => forward(a, w, top && n.name === "str")), out = value(n, w);
      if ((n.name === "max" || n.name === "min") && args.length === 2 && args.every(isNumber))
        w.steps.push(`The ${n.name === "max" ? "larger" : "smaller"} of ${show(args[0], w)} and ${show(args[1], w)} is ${show(out, w)}.`);
      return out;
    }
    case "conditional": {
      const yes = expressionIsTrue(explainCondition(n.condition, w));
      return forward(yes ? n.yes : n.no, w, top);
    }
    case "unary": { forward(n.child, w); return value(n, w); }
    default: return value(n, w);
  }
}
/** A comparison that chooses the answer, shown with its numbers ("345 < 567"). A sampled switch is not shown. */
function explainCondition(n: ExpressionNode, w: Work): ExpressionValue {
  // An equality test ("a % 2 == 0") reads badly as a sentence ("1 = 0 is false"), so it is not shown.
  if (n.kind !== "compare" || n.rest.length !== 1 || !COMPARE[n.rest[0].op] || n.rest[0].op === "==") return value(n, w);
  const fixed = (x: ExpressionNode) => x.kind === "value" || (x.kind === "name" && !w.clean.has(x.name));
  if (fixed(n.first) && fixed(n.rest[0].right) && (n.first.kind === "value" || n.rest[0].right.kind === "value")) return value(n, w);
  const l = forward(n.first, w), r = forward(n.rest[0].right, w), out = value(n, w);
  if (isNumber(l) && isNumber(r)) w.steps.push(`${show(l, w)} ${COMPARE[n.rest[0].op]} ${show(r, w)} is ${expressionIsTrue(out) ? "true" : "false"}.`);
  return out;
}

/** The answer name found by undoing the operations of one plain derived value that holds it once ("c = a + b"). */
function undo(answer: string, w: Work): boolean {
  for (const [name, tree] of w.clean) {
    if (name === answer || tree.kind === "name" || !countsOnce(tree, answer)) continue;
    // Only a value the question prints is the one to undo: "6 × ? = 42" undoes 42, never a helper value it never shows.
    if (w.text && !printed(w.text, show(w.values[name], w))) continue;
    const term = placeTerms(tree, w)?.find(t => t.name === answer);
    if (term) {
      if (!placeName(term.place)) return false;
      w.steps.push(`The ${placeName(term.place)} digit of ${show(w.values[name], w)} is ${show(w.values[answer], w)}.`);
      return true;
    }
    const steps: string[] = [];
    let at: ExpressionNode = tree, target = w.values[name];
    try {
      while (at.kind === "binary") {
        const holds = countsOnce(at.left, answer), other = value(holds ? at.right : at.left, w), next: ExpressionNode = holds ? at.left : at.right;
        let found: ExpressionValue;
        if (at.op === "+") { found = sub(target, other, w); steps.push(`${show(target, w)} − ${show(other, w)} = ${show(found, w)}`); }
        else if (at.op === "-" && holds) { found = add(target, other, w); steps.push(`${show(target, w)} + ${show(other, w)} = ${show(found, w)}`); }
        else if (at.op === "-") { found = sub(other, target, w); steps.push(`${show(other, w)} − ${show(target, w)} = ${show(found, w)}`); }
        else if (at.op === "*") {
          found = evaluateTree({ kind: "binary", op: "//", left: { kind: "value", value: target }, right: { kind: "value", value: other } }, {}, w.budget);
          if (!sameValue(mul(found, other, w), target, w)) return false;
          steps.push(`${show(target, w)} ÷ ${show(other, w)} = ${show(found, w)}`);
        } else return false;
        target = found; at = next;
      }
    } catch { continue; }
    if (at.kind === "name" && at.name === answer && sameValue(target, w.values[answer], w) && steps.length) { w.steps.push(...steps); return true; }
  }
  return false;
}
function countsOnce(n: ExpressionNode, name: string): boolean {
  let count = 0;
  const visit = (x: ExpressionNode) => { if (x.kind === "name" && x.name === name) count++; if (x.kind === "binary") { visit(x.left); visit(x.right); } };
  visit(n);
  return count === 1;
}
const op = (o: string, a: ExpressionValue, b: ExpressionValue, w: Work) =>
  evaluateTree({ kind: "binary", op: o, left: { kind: "value", value: a }, right: { kind: "value", value: b } }, {}, w.budget);
const add = (a: ExpressionValue, b: ExpressionValue, w: Work) => op("+", a, b, w);
const sub = (a: ExpressionValue, b: ExpressionValue, w: Work) => op("-", a, b, w);
const mul = (a: ExpressionValue, b: ExpressionValue, w: Work) => op("*", a, b, w);
const sameValue = (a: ExpressionValue, b: ExpressionValue, w: Work) => show(a, w) === show(b, w);

/**
 * A true or false answer chosen by a sampled switch: the shown number is the right one when the switch is 0
 * ("right + flip * k", "right if flip == 0 else wrong"). The right number is worked out, then set beside the shown one.
 */
function switched(src: TemplateSource, w: Work, answer: string): boolean {
  const flags = new Set(src.slots.filter(s => isSwitch(s.domain)).map(s => s.name));
  const free = (n: ExpressionNode) => ![...names(n)].some(x => flags.has(x));
  for (const [name, expression] of src.derived) {
    const tree = compileExpression(expression, w.budget).tree;
    let right: ExpressionNode | null = null;
    if (tree.kind === "binary" && (tree.op === "+" || tree.op === "-") && free(tree.left) && !free(tree.right)) right = tree.left;
    else if (tree.kind === "conditional" && free(tree.yes) && tree.condition.kind === "compare" && tree.condition.rest.length === 1
      && tree.condition.rest[0].op === "==" && tree.condition.first.kind === "name" && flags.has(tree.condition.first.name)
      && tree.condition.rest[0].right.kind === "value" && tree.condition.rest[0].right.value === BigInt(0)) right = tree.yes;
    if (!right) continue;
    const before = w.steps.length, truth = forward(right, w), shown = w.values[name];
    // The steps must agree with the stored answer: a template whose switch means the other way gets no steps.
    if (!isNumber(truth) || !isNumber(shown) || sameValue(truth, shown, w) !== (answer === "true")) { w.steps.length = before; return false; }
    w.steps.push(sameValue(truth, shown, w) ? `${show(shown, w)} is right.` : `The right number is ${show(truth, w)}, not ${show(shown, w)}.`);
    return true;
  }
  return false;
}
const isSwitch = (d: TemplateSource["slots"][number]["domain"]) => !Array.isArray(d) && d.min === 0 && d.max === 1;

/** The stored answer of a region, written as the template writes it ("39", "false"), or null. */
function storedAnswer(pkg: QuestionPackage, region: string): string | null {
  const r = pkg.item?.regions.find(x => x.id === region);
  if (!r) return null;
  if (r.kind === "choice") return typeof r.answer === "string" ? r.answer : null;
  if (r.kind !== "box" || !r.answer) return null;
  const a = r.answer as { type: string; value?: unknown; numerator?: number; denominator?: number; whole?: number };
  if (a.type === "number" || a.type === "text") return String(a.value);
  if (a.type === "fraction") return `${a.numerator}/${a.denominator}`;
  if (a.type === "mixed") return `${a.whole} ${a.numerator}/${a.denominator}`;
  return null;
}
const sameAnswer = (a: string, b: string) => a === b || (/^-?\d+(?:\.\d+)?$/.test(a) && /^-?\d+(?:\.\d+)?$/.test(b) && Number(a) === Number(b));

const printed = (text: string, number: string) => new RegExp(`(^|[^\\w.,])${number.replace(/[.]/g, "\\.")}(?![\\w]|[.,]\\d)`).test(text);

/** The steps of one template source, ending at its answer, or null when code cannot write them. */
export function templateSourceSteps(src: TemplateSource, text = ""): string[] | null {
  const result = templateAnswer(src);
  if ("problem" in result) return null;
  try {
    const budget = new EvaluationBudget(), values: Values = Object.create(null);
    if (src.values) values.values = Object.freeze(src.values.map(v => scalar(v, budget)));
    for (const slot of src.slots) values[slot.name] = scalar(slot.value, budget);
    const clean = new Map<string, ExpressionNode>();
    for (const [name, expression] of src.derived) {
      const tree = compileExpression(expression, budget).tree;
      values[name] = evaluateTree(tree, values, budget);
      if (plainArithmetic(tree)) clean.set(name, tree);
    }
    const w: Work = { values, clean, budget, steps: [], text };
    const tree = compileExpression(src.answer, budget).tree;
    forward(tree, w, true);
    if (!w.steps.length && (result.answer === "true" || result.answer === "false")) switched(src, w, result.answer);
    if (!w.steps.length) return null;
    if (!w.steps.at(-1)!.endsWith(`= ${result.answer}`)) w.steps.push(`So the answer is ${result.answer}.`);
    // A division that does not end ("2.3333333333333335") is no step for a parent: none are sent.
    if (w.steps.some(step => /\d\.\d{7,}/.test(step))) return null;
    // A negative number takes the same minus sign as the operations ("3 − −5 = 8").
    const steps = w.steps.map(step => step.replace(/(^|[\s(])-(?=\d)/g, "$1−"));
    return steps.length <= MOST_TEMPLATE_STEPS ? steps : null;
  } catch { return null; }
}

/** The steps of a checked package without an operation: from its answer's template source, or null. */
export function templateSolvingSteps(pkg: QuestionPackage): string[] | null {
  // Steps are help, never a reason the explanation fails: anything unexpected sends none.
  try { return solvingSteps(pkg); } catch { return null; }
}
function solvingSteps(pkg: QuestionPackage): string[] | null {
  const checks = (pkg.item?.checks ?? []).filter((c): c is Extract<typeof c, { source: TemplateSource }> => c.kind === "template" || c.kind === "template-choice");
  const check = checks.find(c => c.kind === "template" && c.region === "answer") ?? checks.find(c => c.region === "answer") ?? checks[0];
  if (!check) return null;
  // Several parts worked out by templates, none of them "answer": steps to one part would leave the others unexplained.
  // One worked part beside a plain choice ("Is it right? If not, fix it") keeps its steps.
  if (check.region !== "answer" && new Set(checks.map(c => c.region)).size > 1) return null;
  const stored = storedAnswer(pkg, check.region), result = templateAnswer(check.source);
  if (stored === null || "problem" in result || !sameAnswer(result.answer, stored)) return null;
  return templateSourceSteps(check.source, pkg.text);
}
