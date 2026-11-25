// Evaluates the text of a worked step against a closed clause grammar. It knows no shape.
// Later shapes add new clause kinds in CLAUSE_KINDS and CLAUSE_PARSERS below, not in the shapes.
const NUMBER = String.raw`-?(?:0|[1-9]\d*)(?:\.\d+)?`;
/** One equation clause: "3 × 4 = 12", "2 + 3 + 4 = 9" or "2 - 3 = -1". */
const EQUATION = new RegExp(String.raw`^(${NUMBER}(?: [-+×÷] ${NUMBER})+) = (${NUMBER})$`);
const WHOLE = /^(?:0|[1-9]\d*)$/;
const PLUS = /^plus ([1-9]\d*) is (0|[1-9]\d*)$/;
const WRITE = /^write (nothing|0|[1-9]\d*)$/;
const CARRY = /^carry (0|[1-9]\d*)$/;
const BORROW = /^borrow 1 (ten|hundred|thousand)$/;
const BECOMES = /^([1-9]|10) (ten|hundred|thousand)(s?) (become|becomes) (\d) \2(s?)$/;
/** The units that a place can give, by place. */
export const UNITS = ["one", "ten", "hundred", "thousand"] as const;

/** The closed list of clause kinds in a working step, in strict order. Later shapes add kinds here. */
export const CLAUSE_KINDS = ["borrow", "becomes", "equation", "digit", "plus", "write", "carry"] as const;
export type ClauseKind = (typeof CLAUSE_KINDS)[number];

export type StepClause =
  | { kind: "borrow"; text: string; unit: string }
  | { kind: "becomes"; text: string; unit: string; from: number; ok: boolean }
  | { kind: "equation"; text: string; left: string; ok: boolean; value: bigint | null }
  | { kind: "digit"; text: string }
  | { kind: "plus"; text: string; added: bigint; result: bigint }
  /** No digits for "write nothing". */
  | { kind: "write"; text: string; digits: string }
  | { kind: "carry"; text: string; digit: string };

/** An exact fraction. The bottom is 0 after a division by zero, and then no equation is true. */
interface Exact { top: bigint; bottom: bigint }

function exact(text: string): Exact {
  const [whole, decimals = ""] = text.split(".");
  return { top: BigInt(whole + decimals), bottom: BigInt(10) ** BigInt(decimals.length) };
}

function apply(a: Exact, sign: string, b: Exact): Exact {
  if (sign === "×") return { top: a.top * b.top, bottom: a.bottom * b.bottom };
  if (sign === "÷") return { top: a.top * b.bottom, bottom: a.bottom * b.top };
  const other = sign === "+" ? b.top : -b.top;
  return { top: a.top * b.bottom + other * a.bottom, bottom: a.bottom * b.bottom };
}

/** The value of "2 + 3 × 4": first × and ÷, then + and -. */
function valueOf(text: string): Exact {
  const parts = text.split(" ");
  const terms: Exact[] = [exact(parts[0])];
  const signs: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const next = exact(parts[i + 1]);
    if (parts[i] === "×" || parts[i] === "÷") terms.push(apply(terms.pop()!, parts[i], next));
    else {
      signs.push(parts[i]);
      terms.push(next);
    }
  }
  return terms.slice(1).reduce((sum, term, i) => apply(sum, signs[i], term), terms[0]);
}

const isTrue = (left: string, right: string): boolean => {
  const [a, b] = [valueOf(left), exact(right)];
  return a.bottom !== BigInt(0) && a.top * b.bottom === b.top * a.bottom;
};

const CLAUSE_PARSERS: readonly ((part: string) => StepClause | null)[] = [
  (part) => {
    const found = BORROW.exec(part);
    return found ? { kind: "borrow", text: part, unit: found[1] } : null;
  },
  (part) => {
    const found = BECOMES.exec(part);
    if (!found) return null;
    const [from, to] = [Number(found[1]), Number(found[5])];
    const ok = to === from - 1 && (found[3] === "s") === (from !== 1) && (found[4] === "become") === (from !== 1) && (found[6] === "s") === (to !== 1);
    return { kind: "becomes", text: part, unit: found[2], from, ok };
  },
  (part) => (/^\d$/.test(part) ? { kind: "digit", text: part } : null),
  (part) => {
    // The minus sign and the en dash are a minus too.
    const found = EQUATION.exec(part.replace(/[−–]/g, "-"));
    if (!found) return null;
    const ok = isTrue(found[1], found[2]);
    return { kind: "equation", text: part, left: found[1], ok, value: ok && WHOLE.test(found[2]) ? BigInt(found[2]) : null };
  },
  (part) => {
    const found = PLUS.exec(part);
    return found ? { kind: "plus", text: part, added: BigInt(found[1]), result: BigInt(found[2]) } : null;
  },
  (part) => {
    const found = WRITE.exec(part);
    return found ? { kind: "write", text: part, digits: found[1] === "nothing" ? "" : found[1] } : null;
  },
  (part) => {
    const found = CARRY.exec(part);
    return found ? { kind: "carry", text: part, digit: found[1] } : null;
  },
];

function parseClause(part: string): StepClause | null {
  for (const parse of CLAUSE_PARSERS) {
    const clause = parse(part);
    if (clause) return clause;
  }
  return null;
}

export interface ReadStep {
  /** Clauses that are false, repeated, out of order, or inconsistent with the equation. */
  wrong: string[];
  /** Clauses that the grammar does not know. */
  unread: string[];
}

export interface ParsedStep extends ReadStep {
  clauses: StepClause[];
  /** True when the step is a plain final answer number with no working clauses. */
  answerOnly: boolean;
  problem: string | null;
}

/** The clause of a kind, if a step has it. */
export function clauseOf<K extends ClauseKind>(clauses: readonly StepClause[], kind: K): Extract<StepClause, { kind: K }> | undefined {
  return clauses.find((c): c is Extract<StepClause, { kind: K }> => c.kind === kind);
}

/** The first clause that does not go with the others of its step. */
function clauseProblem(clauses: readonly StepClause[]): { text: string; reason: string } | null {
  const [borrow, becomes, eq, digit] = [clauseOf(clauses, "borrow"), clauseOf(clauses, "becomes"), clauseOf(clauses, "equation"), clauseOf(clauses, "digit")];
  const problem = (text: string, reason: string) => ({ text, reason });
  if (borrow || becomes) {
    if (!borrow || !becomes) return problem("", "must say what it borrows and what that becomes");
    if (borrow.unit !== becomes.unit) return problem(becomes.text, `"${becomes.text}" does not go with "${borrow.text}"`);
    return clauses.length > 2 ? problem(clauses[2].text, `"${clauses[2].text}" follows a borrow in the same step`) : null;
  }
  if (!eq && !digit) return problem("", "has no equation");
  if (eq && digit) return problem(digit.text, `"${digit.text}" follows an equation`);
  const [plus, write, carry] = [clauseOf(clauses, "plus"), clauseOf(clauses, "write"), clauseOf(clauses, "carry")];
  const value = eq ? eq.value : BigInt(digit?.text ?? 0);
  if (value === null) {
    const extra = plus ?? write ?? carry;
    return extra ? problem(extra.text, "follows an equation that is not a whole number") : null;
  }
  if (plus && value + plus.added !== plus.result) return problem(plus.text, `"${plus.text}" does not match ${value} + ${plus.added}`);
  const total = plus ? plus.result : value;
  if (carry) {
    if (carry.digit === "0") return problem(carry.text, "carries 0");
    if (!write) return problem(carry.text, "carries without writing a digit");
    if (write.digits !== String(total % BigInt(10))) return problem(write.text, `"${write.text}" is not the ones digit of ${total}`);
    return carry.digit === String(total / BigInt(10)) ? null : problem(carry.text, `"${carry.text}" is not the carry of ${total}`);
  }
  const isZero = eq !== undefined && !plus && total === BigInt(0);
  return write && write.digits !== String(total) && !(write.digits === "" && isZero) ? problem(write.text, `"${write.text}" does not match ${total}`) : null;
}

/** Parses one step against the closed clause grammar and checks its internal arithmetic. */
export function parseStep(step: string): ParsedStep {
  if (WHOLE.test(step)) return { clauses: [], answerOnly: true, wrong: [], unread: [], problem: null };
  const clauses: StepClause[] = [];
  const wrong: string[] = [];
  const unread: string[] = [];
  let problem: string | null = null;
  const fail = (bucket: string[], text: string, reason: string) => {
    bucket.push(text);
    problem ??= reason;
  };
  let lastOrder = -1;
  for (const part of step.split(", ")) {
    const clause = parseClause(part);
    if (!clause) {
      fail(unread, part, `cannot read "${part}"`);
      continue;
    }
    const order = CLAUSE_KINDS.indexOf(clause.kind);
    if (order === lastOrder) fail(wrong, part, `repeats "${clause.kind}"`);
    else if (order < lastOrder) fail(wrong, part, `"${clause.kind}" comes after "${CLAUSE_KINDS[lastOrder]}"`);
    else {
      lastOrder = order;
      clauses.push(clause);
      if ((clause.kind === "equation" || clause.kind === "becomes") && !clause.ok) fail(wrong, part, `holds "${part}"`);
    }
  }
  if (unread.length > 0 || wrong.length > 0) return { clauses, answerOnly: false, wrong, unread, problem };
  const inside = clauseProblem(clauses);
  if (inside) fail(wrong, inside.text || step, inside.reason);
  return { clauses, answerOnly: false, wrong, unread, problem };
}

/** Reads every clause of a step against the closed grammar so no part of a step is left unchecked. */
export function readStep(step: string): ReadStep {
  const { wrong, unread } = parseStep(step);
  return { wrong, unread };
}
