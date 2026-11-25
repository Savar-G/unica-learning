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
const LESS = /^(0|[1-9]\d*) is less than ([1-9]\d*)$/;
const USE = /^use ([1-9]\d*)$/;
const TOO_MUCH = /^([1-9]\d*) × ([1-9]\d*) = ([1-9]\d*) is too much$/;
const MULTIPLE = /^([1-9]\d*) × ([1-9]\d*)$/;
const BRING_DOWN = /^bring down (\d)$/;
const NOW = /^now (0|[1-9]\d*)$/;
/** The units that a place can give, by place. */
export const UNITS = ["one", "ten", "hundred", "thousand"] as const;

/** The closed list of clause kinds in a working step, in strict order. Later shapes add kinds here. */
export const CLAUSE_KINDS = ["borrow", "becomes", "less", "use", "equation", "digit", "too-much", "plus", "write", "carry", "bring-down", "now"] as const;
export type ClauseKind = (typeof CLAUSE_KINDS)[number];
/** The clauses that only a division says. */
const DIVISION_KINDS: readonly ClauseKind[] = ["less", "use", "too-much", "bring-down", "now"];
/** The clauses of each step with one of them: the two digits that are used together, a 0 of the quotient, the largest multiple, and what is left. */
const DIVISION_STEPS: readonly string[] = ["less use", "less write", "less write bring-down now", "equation too-much write", "equation bring-down now"];

export type StepClause =
  | { kind: "borrow"; text: string; unit: string }
  | { kind: "becomes"; text: string; unit: string; from: number; ok: boolean }
  | { kind: "equation"; text: string; left: string; ok: boolean; value: bigint | null }
  | { kind: "digit"; text: string }
  | { kind: "plus"; text: string; added: bigint; result: bigint }
  /** No digits for "write nothing". */
  | { kind: "write"; text: string; digits: string }
  | { kind: "carry"; text: string; digit: string }
  | { kind: "less"; text: string; part: number; divisor: number }
  | { kind: "use"; text: string; part: number }
  | { kind: "too-much"; text: string; divisor: number; times: number; value: number }
  | { kind: "bring-down"; text: string; digit: number }
  | { kind: "now"; text: string; part: number };

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
  (part) => {
    const found = LESS.exec(part);
    return found ? { kind: "less", text: part, part: Number(found[1]), divisor: Number(found[2]) } : null;
  },
  (part) => {
    const found = USE.exec(part);
    return found ? { kind: "use", text: part, part: Number(found[1]) } : null;
  },
  (part) => {
    const found = TOO_MUCH.exec(part);
    return found ? { kind: "too-much", text: part, divisor: Number(found[1]), times: Number(found[2]), value: Number(found[3]) } : null;
  },
  (part) => {
    const found = BRING_DOWN.exec(part);
    return found ? { kind: "bring-down", text: part, digit: Number(found[1]) } : null;
  },
  (part) => {
    const found = NOW.exec(part);
    return found ? { kind: "now", text: part, part: Number(found[1]) } : null;
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
  /** True when the step has a clause that only a division says. */
  dividing: boolean;
}

/** The clause of a kind, if a step has it. */
export function clauseOf<K extends ClauseKind>(clauses: readonly StepClause[], kind: K): Extract<StepClause, { kind: K }> | undefined {
  return clauses.find((c): c is Extract<StepClause, { kind: K }> => c.kind === kind);
}

interface ClauseProblem { text: string; reason: string }

const isDividing = (clauses: readonly StepClause[]): boolean => clauses.some((c) => DIVISION_KINDS.includes(c.kind));

/** The two numbers of "4 × 9", or null. */
export function multipleOf(text: string): { divisor: number; times: number } | null {
  const found = MULTIPLE.exec(text);
  return found && { divisor: Number(found[1]), times: Number(found[2]) };
}

/** The first clause of a step of a division that does not go with the others. */
function divisionClauseProblem(clauses: readonly StepClause[]): ClauseProblem | null {
  const kinds = clauses.map((c) => c.kind).join(" ");
  if (!DIVISION_STEPS.includes(kinds)) return { text: "", reason: `has the clauses ${kinds}, which no step of a division has` };
  const [less, use, eq, tooMuch] = [clauseOf(clauses, "less"), clauseOf(clauses, "use"), clauseOf(clauses, "equation"), clauseOf(clauses, "too-much")];
  const [write, down, now] = [clauseOf(clauses, "write"), clauseOf(clauses, "bring-down"), clauseOf(clauses, "now")];
  const wrong = (clause: StepClause, reason: string): ClauseProblem => ({ text: clause.text, reason: `"${clause.text}" ${reason}` });
  if (less && less.part >= less.divisor) return wrong(less, "is not true");
  if (less && use && Math.floor(use.part / 10) !== less.part) return wrong(use, `does not go on from ${less.part}`);
  if (less && write && write.digits !== "0") return wrong(write, "must be 0, because the divisor does not fit");
  if (eq && tooMuch) {
    const multiple = multipleOf(eq.left);
    if (!multiple) return wrong(eq, "is no multiple of the divisor");
    if (tooMuch.divisor !== multiple.divisor || tooMuch.times !== multiple.times + 1) return wrong(tooMuch, `is not the next multiple after ${eq.left}`);
    if (tooMuch.value !== tooMuch.divisor * tooMuch.times) return wrong(tooMuch, "is not true");
    if (write && write.digits !== String(multiple.times)) return wrong(write, `is not the number of times in ${eq.left}`);
  }
  if (!down || !now) return null;
  if (eq && !/^\d+ - \d+$/.test(eq.left)) return wrong(down, "comes after something else than what is left");
  const rest = eq ? Number(eq.value) : (less?.part ?? 0);
  return now.part === rest * 10 + down.digit ? null : wrong(now, `is not ${rest} with ${down.digit} next to it`);
}

/** The first clause that does not go with the others of its step. */
function clauseProblem(clauses: readonly StepClause[]): ClauseProblem | null {
  if (isDividing(clauses)) return divisionClauseProblem(clauses);
  const [borrow, becomes, eq, digit] = [clauseOf(clauses, "borrow"), clauseOf(clauses, "becomes"), clauseOf(clauses, "equation"), clauseOf(clauses, "digit")];
  const problem = (text: string, reason: string): ClauseProblem => ({ text, reason });
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
  if (WHOLE.test(step)) return { clauses: [], answerOnly: true, wrong: [], unread: [], problem: null, dividing: false };
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
  const dividing = isDividing(clauses);
  if (unread.length > 0 || wrong.length > 0) return { clauses, answerOnly: false, wrong, unread, problem, dividing };
  const inside = clauseProblem(clauses);
  if (inside) fail(wrong, inside.text || step, inside.reason);
  return { clauses, answerOnly: false, wrong, unread, problem, dividing };
}

/** Reads every clause of a step against the closed grammar so no part of a step is left unchecked. */
export function readStep(step: string): ReadStep {
  const { wrong, unread } = parseStep(step);
  return { wrong, unread };
}
