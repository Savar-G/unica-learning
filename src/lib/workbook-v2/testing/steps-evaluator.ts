// Evaluates the text of a worked step against a closed clause grammar. It knows no shape.
// Later shapes add new clause kinds in CLAUSE_KINDS and CLAUSE_PARSERS below, not in the shapes.
const NUMBER = String.raw`-?(?:0|[1-9]\d*)(?:\.\d+)?`;
/** One equation clause: "3 × 4 = 12", "2 + 3 + 4 = 9" or "2 - 3 = -1". */
const EQUATION = new RegExp(String.raw`^(${NUMBER}(?: [-+×÷] ${NUMBER})+) = (${NUMBER})$`);
const WHOLE = /^(?:0|[1-9]\d*)$/;
const PLUS = /^plus ([1-9]\d*) is (0|[1-9]\d*)$/;
const WRITE = /^write (0|[1-9]\d*)$/;
const CARRY = /^carry (0|[1-9]\d*)$/;

/** The closed list of clause kinds in a working step, in strict order. Later shapes add kinds here. */
export const CLAUSE_KINDS = ["equation", "plus", "write", "carry"] as const;
export type ClauseKind = (typeof CLAUSE_KINDS)[number];

export type StepClause =
  | { kind: "equation"; text: string; ok: boolean; value: bigint | null }
  | { kind: "plus"; text: string; added: bigint; result: bigint }
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
    // The minus sign and the en dash are a minus too.
    const found = EQUATION.exec(part.replace(/[−–]/g, "-"));
    if (!found) return null;
    const ok = isTrue(found[1], found[2]);
    return { kind: "equation", text: part, ok, value: ok && WHOLE.test(found[2]) ? BigInt(found[2]) : null };
  },
  (part) => {
    const found = PLUS.exec(part);
    return found ? { kind: "plus", text: part, added: BigInt(found[1]), result: BigInt(found[2]) } : null;
  },
  (part) => {
    const found = WRITE.exec(part);
    return found ? { kind: "write", text: part, digits: found[1] } : null;
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
      if (clause.kind === "equation" && !clause.ok) fail(wrong, part, `holds "${part}"`);
    }
  }
  if (unread.length > 0 || wrong.length > 0) return { clauses, answerOnly: false, wrong, unread, problem };
  const eq = clauses[0];
  if (eq?.kind !== "equation") {
    fail(wrong, step, "has no equation");
    return { clauses, answerOnly: false, wrong, unread, problem };
  }
  const plus = clauses.find((c): c is Extract<StepClause, { kind: "plus" }> => c.kind === "plus");
  const write = clauses.find((c): c is Extract<StepClause, { kind: "write" }> => c.kind === "write");
  const carry = clauses.find((c): c is Extract<StepClause, { kind: "carry" }> => c.kind === "carry");
  if ((plus || write || carry) && eq.value === null) {
    const extra = plus ?? write ?? carry;
    if (extra) fail(wrong, extra.text, "follows an equation that is not a whole number");
    return { clauses, answerOnly: false, wrong, unread, problem };
  }
  if (eq.value !== null) {
    if (plus && eq.value + plus.added !== plus.result) fail(wrong, plus.text, `"${plus.text}" does not match ${eq.value} + ${plus.added}`);
    const total = plus ? plus.result : eq.value;
    if (carry) {
      if (carry.digit === "0") fail(wrong, carry.text, "carries 0");
      else if (!write) fail(wrong, carry.text, "carries without writing a digit");
      else {
        if (write.digits !== String(total % BigInt(10))) fail(wrong, write.text, `"${write.text}" is not the ones digit of ${total}`);
        if (carry.digit !== String(total / BigInt(10))) fail(wrong, carry.text, `"${carry.text}" is not the carry of ${total}`);
      }
    } else if (write && write.digits !== String(total)) {
      fail(wrong, write.text, `"${write.text}" does not match ${total}`);
    }
  }
  return { clauses, answerOnly: false, wrong, unread, problem };
}

/** Reads every clause of a step against the closed grammar so no part of a step is left unchecked. */
export function readStep(step: string): ReadStep {
  const { wrong, unread } = parseStep(step);
  return { wrong, unread };
}
