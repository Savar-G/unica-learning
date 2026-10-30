// Expressions and one-variable equations in the question package (#307): a strict reader of the written expression,
// its work in the order of operations, and the operation kinds that evaluate an expression with given values and
// solve an equation. The kinds join the others in question-package-math.ts.
//
// An expression is written as the child reads it: whole numbers and decimals, one-letter unknowns, + − × ÷ and
// brackets, a number written against an unknown or a bracket for a product ("3n", "2(n + 1)"), and a minus sign at the
// start of the expression or of a bracket for a negative number ("−3 + 5 × (−2)"). Anything else is "unsupported",
// never a guess. Every value is an exact rational on BigInt, so no step goes through floating-point arithmetic.
// Pure TypeScript: no Next.js, React, network, database or clock.
import type { AnswerValue, WorkedStep } from "@/lib/question-package";
import type { KindRules, Of } from "@/lib/question-package-math";
import { beyond, fail, isOne, written, type OperationProblem } from "@/lib/question-package-columns";

/** An operation sign in an expression. */
export type Sign = "+" | "−" | "×" | "÷";

const MAX_OPERATIONS = 8;
const MAX_LITERAL = 99999;
const MAX_PLACES = 3;
const MAX_VALUE = 1000000000;
const MAX_VALUE_PLACES = 6;

const BIG_LITERAL = beyond(`code checks expressions only with numbers up to ${MAX_LITERAL}.999, with at most ${MAX_PLACES} decimal places`);
const ENDLESS = beyond("code checks expressions only where each division gives a whole number or a decimal");
const BIG_VALUE = beyond(`code checks expressions only with values up to ${MAX_VALUE}, with at most ${MAX_VALUE_PLACES} decimal places`);

// ---------- Exact numbers ----------

/** An exact rational [numerator, denominator], the denominator above 0, in lowest terms. */
type Rational = [bigint, bigint];
const big = BigInt;
const ZERO = big(0);
const ONE = big(1);
const TEN = big(10);
const bigAbs = (a: bigint) => (a < ZERO ? -a : a);
const bigGcd = (a: bigint, b: bigint): bigint => (b === ZERO ? bigAbs(a) : bigGcd(b, a % b));
function rational(n: bigint, d: bigint): Rational {
  const g = bigGcd(n, d) || ONE;
  return d < ZERO ? [-n / g, -d / g] : [n / g, d / g];
}

/** A number from a JSON value, read from its written digits; null for more than `places` decimal places. */
function fromNumber(value: number, places: number): Rational | null {
  const w = written(Math.abs(value), places);
  return w && rational(big(value < 0 ? -w.scaled : w.scaled), TEN ** big(w.places));
}

/** The decimal places of a rational whose decimal ends, or null when it goes on (1/3). */
function placesOf([, d]: Rational): number | null {
  let [twos, fives, rest] = [0, 0, d];
  while (rest % big(2) === ZERO) [rest, twos] = [rest / big(2), twos + 1];
  while (rest % big(5) === ZERO) [rest, fives] = [rest / big(5), fives + 1];
  return rest === ONE ? Math.max(twos, fives) : null;
}

/** The digits of a rational whose decimal ends, without its sign: "8.75". */
function digitsOf(r: Rational): string {
  const places = placesOf(r) ?? 0;
  const digits = ((bigAbs(r[0]) * TEN ** big(places)) / r[1]).toString().padStart(places + 1, "0");
  return places === 0 ? digits : `${digits.slice(0, -places)}.${digits.slice(-places)}`;
}

/** A rational as written: "8.75", "−13". */
const numberText = (r: Rational) => `${r[0] < ZERO ? "−" : ""}${digitsOf(r)}`;
/** A rational as a JSON number. It must end within the value limits (checked as it is worked). */
const toNumber = (r: Rational) => Number(`${r[0] < ZERO ? "-" : ""}${digitsOf(r)}`);

function compute(sign: Sign, [a, b]: Rational, [c, d]: Rational): Rational {
  switch (sign) {
    case "+":
      return rational(a * d + c * b, b * d);
    case "−":
      return rational(a * d - c * b, b * d);
    case "×":
      return rational(a * c, b * d);
    case "÷":
      if (c === ZERO) throw new Refusal(fail("the expression divides by zero"));
      return rational(a * d, b * c);
  }
}

/** A worked value: its decimal ends, within the limits. */
function checked(r: Rational): Rational {
  const places = placesOf(r);
  if (places === null) throw new Refusal(ENDLESS);
  if (places > MAX_VALUE_PLACES || bigAbs(r[0]) > big(MAX_VALUE) * r[1]) throw new Refusal(BIG_VALUE);
  return r;
}

// ---------- Reading an expression ----------

/** Why an expression or an equation cannot be worked; thrown inside this module only, and caught as a problem. */
class Refusal {
  constructor(readonly problem: OperationProblem) {}
}

type Token = { pos: number; space: boolean } & ({ k: "num"; value: Rational } | { k: "var"; name: string } | { k: "sign"; sign: Sign } | { k: "(" } | { k: ")" });

/** An expression as a tree: the position of each sign in the text keeps the left-to-right order. */
type Node =
  | { t: "num"; value: Rational }
  | { t: "var"; name: string }
  | { t: "bin"; sign: Sign; left: Node; right: Node; implicit: boolean; pos: number }
  | { t: "group"; inner: Node };

const SIGNS: readonly string[] = ["+", "−", "×", "÷"];

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (let pos = 0; pos < text.length;) {
    const ch = text[pos];
    if (ch === " ") {
      pos++;
      continue;
    }
    const at = { pos, space: pos > 0 && text[pos - 1] === " " };
    const number = /^(\d+)(?:\.(\d+))?/.exec(text.slice(pos));
    if (number) {
      if ((number[2] ?? "").length > MAX_PLACES || Number(number[1]) > MAX_LITERAL) throw new Refusal(BIG_LITERAL);
      tokens.push({ ...at, k: "num", value: rational(big(number[1] + (number[2] ?? "")), TEN ** big((number[2] ?? "").length)) });
      pos += number[0].length;
    } else if (/[a-z]/.test(ch)) {
      if (/[a-z]/.test(text[pos + 1] ?? "")) throw new Refusal(beyond("code reads only one-letter unknowns"));
      tokens.push({ ...at, k: "var", name: ch });
      pos++;
    } else if (SIGNS.includes(ch)) {
      tokens.push({ ...at, k: "sign", sign: ch as Sign });
      pos++;
    } else if (ch === "(" || ch === ")") {
      tokens.push({ ...at, k: ch });
      pos++;
    } else {
      throw new Refusal(beyond(`code cannot read ${ch} in an expression`));
    }
  }
  return tokens;
}

/** Reads an expression; throws a Refusal for one written wrong or one code cannot read. */
function parse(text: string): Node {
  const tokens = tokenize(text);
  const malformed = () => new Refusal(fail(`the expression ${text} is not written right`));
  let i = 0;
  const signAt = (signs: Sign[]) => {
    const t = tokens[i];
    return t?.k === "sign" && signs.includes(t.sign) ? t : null;
  };

  function expression(start: boolean): Node {
    let node = term(start);
    for (let t = signAt(["+", "−"]); t; t = signAt(["+", "−"])) {
      i++;
      node = { t: "bin", sign: t.sign, left: node, right: term(false), implicit: false, pos: t.pos };
    }
    return node;
  }

  function term(start: boolean): Node {
    let node = factor(start);
    let divided = false;
    for (;;) {
      const t = tokens[i];
      const product = signAt(["×", "÷"]);
      if (product) {
        i++;
        node = { t: "bin", sign: product.sign, left: node, right: factor(false), implicit: false, pos: product.pos };
        divided = product.sign === "÷";
      } else if (t && (t.k === "var" || t.k === "(") && !t.space) {
        // "6 ÷ 2(1 + 2)" is read two ways; code does not choose one.
        if (divided) throw new Refusal(beyond("code does not read a division before a product written without ×"));
        node = { t: "bin", sign: "×", left: node, right: factor(false), implicit: true, pos: t.pos };
      } else {
        return node;
      }
    }
  }

  function factor(start: boolean): Node {
    const t = tokens[i++];
    if (t?.k === "num") return { t: "num", value: t.value };
    if (t?.k === "var") return { t: "var", name: t.name };
    if (t?.k === "(") {
      const inner = expression(true);
      if (tokens[i++]?.k !== ")") throw malformed();
      return { t: "group", inner };
    }
    if (t?.k === "sign" && t.sign === "−") {
      const next = tokens[i];
      if (start && next?.k === "num" && !next.space) {
        i++;
        return { t: "num", value: rational(-next.value[0], next.value[1]) };
      }
      throw new Refusal(beyond("code reads a minus sign at the start only before a number"));
    }
    throw malformed();
  }

  const node = expression(true);
  if (i !== tokens.length) throw malformed();
  if (operations(node) > MAX_OPERATIONS) throw new Refusal(beyond(`code checks expressions only with up to ${MAX_OPERATIONS} operations`));
  return node;
}

const operations = (node: Node): number =>
  node.t === "bin" ? 1 + operations(node.left) + operations(node.right) : node.t === "group" ? operations(node.inner) : 0;

/** The unknowns of an expression, in the order they are written. */
function unknowns(node: Node): string[] {
  const names: string[] = [];
  const walk = (n: Node) => {
    if (n.t === "var" && !names.includes(n.name)) names.push(n.name);
    if (n.t === "bin") [n.left, n.right].forEach(walk);
    if (n.t === "group") walk(n.inner);
  };
  walk(node);
  return names;
}

const hasUnknown = (node: Node) => unknowns(node).length > 0;

/** The expression with the unknowns given values. */
function substitute(node: Node, values: Map<string, Rational>): Node {
  switch (node.t) {
    case "var":
      return values.has(node.name) ? { t: "num", value: values.get(node.name)! } : node;
    case "bin":
      return { ...node, left: substitute(node.left, values), right: substitute(node.right, values) };
    case "group":
      return { t: "group", inner: substitute(node.inner, values) };
    default:
      return node;
  }
}

/** Brackets around one number are dropped; a negative number is written in brackets where it needs them (print). */
function normalize(node: Node): Node {
  switch (node.t) {
    case "group": {
      const inner = normalize(node.inner);
      return inner.t === "num" ? inner : { t: "group", inner };
    }
    case "bin":
      return { ...node, left: normalize(node.left), right: normalize(node.right) };
    default:
      return node;
  }
}

/**
 * An expression as written: a negative number after a sign in brackets ("5 × (−2)"), and a product written without ×
 * only while it has an unknown ("3n"; "3 × 4" once n is 4).
 */
function print(node: Node, first = true): string {
  switch (node.t) {
    case "num":
      return node.value[0] < ZERO && !first ? `(${numberText(node.value)})` : numberText(node.value);
    case "var":
      return node.name;
    case "group":
      return `(${print(node.inner)})`;
    case "bin": {
      const left = print(node.left, first);
      const right = print(node.right, false);
      return node.implicit && hasUnknown(node.right) ? `${left}${right}` : `${left} ${node.sign} ${right}`;
    }
  }
}

// ---------- Working an expression ----------

/** Why an operation is worked now: brackets first, then × and ÷, then + and −, each from left to right. */
export type OperateRule = "brackets" | "multiply-divide" | "add-subtract";
type OperateStep = Extract<WorkedStep, { kind: "operate" }>;

/** The operations ready to work (two numbers), with their depth inside brackets. */
function ready(node: Node, depth = 0): { node: Extract<Node, { t: "bin" }>; depth: number }[] {
  if (node.t === "group") return ready(node.inner, depth + 1);
  if (node.t !== "bin") return [];
  if (node.left.t === "num" && node.right.t === "num") return [{ node, depth }];
  return [...ready(node.left, depth), ...ready(node.right, depth)];
}

const multiplies = (sign: Sign) => sign === "×" || sign === "÷";

function replace(node: Node, target: Node, by: Node): Node {
  if (node === target) return by;
  if (node.t === "bin") return { ...node, left: replace(node.left, target, by), right: replace(node.right, target, by) };
  if (node.t === "group") return { t: "group", inner: replace(node.inner, target, by) };
  return node;
}

/** Works an expression with no unknowns, one operation at a time; throws a Refusal for one that cannot be worked. */
function work(start: Node, prefix = "e"): { steps: OperateStep[]; value: Rational } {
  let tree = normalize(start);
  const steps: OperateStep[] = [];
  while (tree.t !== "num") {
    const candidates = ready(tree);
    if (candidates.length === 0) throw new Refusal(fail("the expression has an unknown with no value"));
    // The deepest brackets first, then × and ÷ before + and −, then the leftmost.
    const [next] = candidates.sort((a, b) => b.depth - a.depth || Number(multiplies(b.node.sign)) - Number(multiplies(a.node.sign)) || a.node.pos - b.node.pos);
    const { sign, left, right } = next.node as { sign: Sign; left: { value: Rational }; right: { value: Rational } };
    const value = checked(compute(sign, left.value, right.value));
    tree = normalize(replace(tree, next.node, { t: "num", value }));
    const rule: OperateRule = next.depth > 0 ? "brackets" : multiplies(sign) ? "multiply-divide" : "add-subtract";
    steps.push({ id: `${prefix}${steps.length + 1}`, kind: "operate", rule, op: sign, left: toNumber(left.value), right: toNumber(right.value), value: toNumber(value), rest: print(tree) });
  }
  return { steps, value: tree.value };
}

/** Runs a reading or a working, giving its problem instead of throwing. */
function attempt<T>(run: () => T): { ok: true; value: T } | { ok: false; problem: OperationProblem } {
  try {
    return { ok: true, value: run() };
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, problem: e.problem };
    throw e;
  }
}

// ---------- Evaluate ----------

type Fields = Record<string, unknown>;
type EvaluateOperation = Of<"evaluate">;

/** The given values, in the order their unknowns are written. */
function givenValues(op: EvaluateOperation, tree: Node): { name: string; value: number }[] {
  return unknowns(tree).map((name) => ({ name, value: (op.values ?? {})[name] }));
}

const valueMap = (values: { name: string; value: number }[]) => new Map(values.map((v) => [v.name, fromNumber(v.value, MAX_PLACES)!]));

/** The work of an evaluation: the values put in, then each operation. The operation must be valid. */
function evaluation(op: EvaluateOperation): { steps: WorkedStep[]; value: Rational; statement: string } {
  const tree = parse(op.operands[0]);
  const values = givenValues(op, tree);
  const filled = normalize(substitute(tree, valueMap(values)));
  const { steps, value } = work(filled);
  const substitution: WorkedStep[] = values.length > 0 ? [{ id: "substitute", kind: "substitute", values, expression: print(filled) }] : [];
  return { steps: [...substitution, ...steps], value, statement: print(filled) };
}

function evaluateProblem(op: Fields): OperationProblem | null {
  if (!isOne(op.operands) || typeof op.operands[0] !== "string" || op.operands[0].trim() === "") return fail("the operation needs an expression");
  const expression = op.operands[0];
  const values = op.values ?? {};
  if (typeof values !== "object" || values === null || Array.isArray(values)) return fail("the values are not names with numbers");
  for (const [name, value] of Object.entries(values)) {
    if (!/^[a-z]$/.test(name)) return fail(`the value name ${name} is not one letter`);
    if (typeof value !== "number" || !Number.isFinite(value)) return fail(`the value for ${name} is not a number`);
    if (fromNumber(value, MAX_PLACES) === null || Math.floor(Math.abs(value)) > MAX_LITERAL) return BIG_LITERAL;
  }
  const tree = attempt(() => parse(expression));
  if (!tree.ok) return tree.problem;
  const names = unknowns(tree.value);
  const missing = names.find((n) => !Object.hasOwn(values, n));
  if (missing) return fail(`the expression has ${missing}, but no value for it`);
  const unused = Object.keys(values).find((n) => !names.includes(n));
  if (unused) return fail(`the value for ${unused} is not in the expression`);
  const result = attempt(() => evaluation(op as EvaluateOperation));
  return result.ok ? null : result.problem;
}

// ---------- Solve ----------

type SolveOperation = Of<"solve">;
type InverseStep = Extract<WorkedStep, { kind: "inverse" }>;

/** What undoes each operation around the unknown. */
const UNDO: Record<Sign, { op: InverseStep["op"]; sign: Sign }> = {
  "+": { op: "subtract", sign: "−" },
  "−": { op: "add", sign: "+" },
  "×": { op: "divide", sign: "÷" },
  "÷": { op: "multiply", sign: "×" },
};

/** Brackets around the whole side are not needed once the operation outside them is undone. */
const unwrap = (node: Node): Node => (node.t === "group" ? unwrap(node.inner) : node);

/** How often the unknowns are written. */
const occurrences = (node: Node): number =>
  node.t === "var" ? 1 : node.t === "bin" ? occurrences(node.left) + occurrences(node.right) : node.t === "group" ? occurrences(node.inner) : 0;

/** An equation solved: the steps that undo each operation, the check, the solution and the unknown's name. */
function solution(op: SolveOperation): { steps: WorkedStep[]; value: Rational; name: string } {
  const text = op.operands[0];
  const parts = text.split("=");
  if (parts.length < 2) throw new Refusal(fail("the equation has no ="));
  if (parts.length > 2) throw new Refusal(fail("the equation has more than one ="));
  if (parts.some((s) => s.trim() === "")) throw new Refusal(fail(`the equation ${text} is not written right`));
  const [left, right] = parts.map((s) => normalize(parse(s.trim())));
  const names = [...new Set([...unknowns(left), ...unknowns(right)])];
  if (names.length === 0) throw new Refusal(fail("the equation has no unknown"));
  if (names.length > 1) throw new Refusal(beyond("code solves only equations with one unknown"));
  if (occurrences(left) + occurrences(right) > 1) throw new Refusal(beyond("code solves only equations with the unknown written once"));
  const unknownFirst = hasUnknown(left);
  const [unknownSide, numberSide] = unknownFirst ? [left, right] : [right, left];
  if (numberSide.t !== "num") throw new Refusal(beyond("code solves only equations with one number on one side"));
  const equation = (side: Node, value: Rational) => (unknownFirst ? `${print(side)} = ${numberText(value)}` : `${numberText(value)} = ${print(side)}`);

  const steps: WorkedStep[] = [];
  let side = unwrap(unknownSide);
  let value = numberSide.value;
  while (side.t === "bin") {
    const unknownLeft = hasUnknown(side.left);
    const number = unknownLeft ? side.right : side.left;
    if (number.t !== "num") throw new Refusal(beyond("code solves only equations where each number next to the unknown is one number"));
    if (!unknownLeft && (side.sign === "−" || side.sign === "÷")) {
      throw new Refusal(beyond("code solves only equations where the unknown is not taken away from or divided into a number"));
    }
    if (number.value[0] === ZERO && side.sign === "×") throw new Refusal(fail("the equation multiplies the unknown by 0"));
    const undo = UNDO[side.sign];
    const next = checked(compute(undo.sign, value, number.value));
    side = unwrap(unknownLeft ? side.left : side.right);
    steps.push({ id: `s${steps.length + 1}`, kind: "inverse", op: undo.op, by: toNumber(number.value), from: toNumber(value), value: toNumber(next), equation: equation(side, next) });
    value = next;
  }
  if (steps.length === 0) throw new Refusal(fail("the equation is already solved"));
  const name = names[0];
  const filled = normalize(substitute(unknownSide, new Map([[name, value]])));
  steps.push({ id: "check", kind: "check", name, value: toNumber(value), expression: print(unwrap(filled)), total: toNumber(numberSide.value) });
  return { steps, value, name };
}

function solveProblem(op: Fields): OperationProblem | null {
  if (!isOne(op.operands) || typeof op.operands[0] !== "string" || op.operands[0].trim() === "") return fail("the operation needs an equation");
  const result = attempt(() => solution(op as SolveOperation));
  return result.ok ? null : result.problem;
}

const NUMBER_RULES = { answer: "result", accepted: "same-number", sameNumberWrong: "never" } as const;

/** The algebra kinds. */
export type AlgebraKind = "evaluate" | "solve";

export const ALGEBRA_KINDS: { [K in AlgebraKind]: KindRules<Of<K>> } = {
  evaluate: {
    ...NUMBER_RULES,
    problem: evaluateProblem,
    text: (op) => {
      const [expression] = op.operands;
      const values = givenValues(op, parse(expression));
      const given = values.map((v) => `${v.name} = ${numberText(fromNumber(v.value, MAX_PLACES)!)}`).join(" and ");
      return values.length > 0 ? `${expression} when ${given}` : expression;
    },
    statement: (op) => evaluation(op).statement,
    steps: (op) => evaluation(op).steps,
    result: (op): AnswerValue => ({ type: "number", value: toNumber(evaluation(op).value) }),
  },
  solve: {
    ...NUMBER_RULES,
    problem: solveProblem,
    text: (op) => op.operands[0],
    statement: (op) => solution(op).name,
    steps: (op) => solution(op).steps,
    result: (op): AnswerValue => ({ type: "number", value: toNumber(solution(op).value) }),
  },
};

const INVERSE_WORDS: Record<InverseStep["op"], [string, Sign]> = {
  add: ["Add {} to both sides", "+"],
  subtract: ["Subtract {} from both sides", "−"],
  multiply: ["Multiply both sides by {}", "×"],
  divide: ["Divide both sides by {}", "÷"],
};

const RULE_WORDS: Record<OperateRule, string> = {
  brackets: "Work inside the brackets first",
  "multiply-divide": "Multiply and divide from left to right, before you add and subtract",
  "add-subtract": "Add and subtract from left to right",
};

/** A JSON number as written in a step: "−2" first, "(−2)" after a sign. */
const valueText = (n: number, first: boolean) => print({ t: "num", value: fromNumber(n, MAX_VALUE_PLACES) ?? [ZERO, ONE] }, first);

type AlgebraStep = Extract<WorkedStep, { kind: "substitute" | "operate" | "inverse" | "check" }>;

/** A step of an algebra kind in words, for a board or a voice. */
export function algebraStepText(step: AlgebraStep): string {
  if (step.kind === "inverse") {
    const [doing, sign] = INVERSE_WORDS[step.op];
    const by = valueText(step.by, true);
    return `${doing.replace("{}", by)}: ${valueText(step.from, true)} ${sign} ${valueText(step.by, false)} = ${valueText(step.value, true)}, so ${step.equation}.`;
  }
  if (step.kind === "check") return `Check: put ${valueText(step.value, true)} in for ${step.name}: ${step.expression} = ${valueText(step.total, true)}.`;
  if (step.kind === "substitute") {
    return `Put ${step.values.map((v) => `${valueText(v.value, true)} in for ${v.name}`).join(" and ")}: ${step.expression}.`;
  }
  const { rule, op, left, right, value, rest } = step;
  const now = rest === valueText(value, true) ? "" : ` Now ${rest}.`;
  return `${RULE_WORDS[rule]}: ${valueText(left, true)} ${op} ${valueText(right, false)} = ${valueText(value, true)}.${now}`;
}
