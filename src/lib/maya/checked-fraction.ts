// #1156 (spec #1137): checked fraction addition and subtraction, taught with fraction strips. Pure TypeScript: the
// supported forms, their checked facts, the code-owned words and board batches, and the lesson map's next step.
//
// Supported forms (everything else keeps the existing fraction route):
// - two proper fractions with the same denominator ("2/5 + 1/5", "7/8 - 3/8"),
// - two proper fractions where one denominator is a multiple of the other ("3/4 + 1/8", "5/6 - 1/3"),
// with a common denominator of at most 12 (the strip's limit), a result above 0 and below 1, and no unit.
// Not supported: mixed or whole operands, unrelated denominators (1/3 + 1/4), results of 1 or more, multiply, divide,
// simplify-only and equivalent-only questions.
import type { Command } from "@/lib/board";
import { workedSteps, type AnswerValue, type OperationPackage } from "@/lib/question-package";

export type Frac = [number, number];
export type FractionOp = "add" | "subtract";
export const FRACTION_OBJECT = "fraction-split";

/** The checked facts of one fraction sum: both operands, the common denominator and the renamed numerators. */
export interface FractionFacts {
  op: FractionOp;
  a: Frac;
  b: Frac;
  common: number;
  /** The operand whose parts are split to make the common denominator; null when the denominators match. */
  renamed: "a" | "b" | null;
  a2: number;
  b2: number;
  /** The result's numerator over `common`. */
  result: number;
}

export type FractionStep =
  | "check_parts" | "rename_ask" | "show" | "misconception" | "renamed" | "demonstrate" | "count" | "count_hint"
  | "name_fraction" | "simplify" | "correct" | "offer" | "decline"
  | "transfer" | "transfer_retry" | "transfer_show" | "transfer_correct";

export type FractionMistake = "add_across" | "unlike_parts";

export interface FractionInstruction {
  step: FractionStep;
  mistake?: FractionMistake;
  asksSimplest?: true;
  /** The related question's operands on each turn of it: [a numerator, a denominator, b numerator, b denominator]. */
  transfer?: [number, number, number, number];
}

const NAMES: Record<number, [string, string]> = {
  2: ["half", "halves"], 3: ["third", "thirds"], 4: ["fourth", "fourths"], 5: ["fifth", "fifths"], 6: ["sixth", "sixths"],
  7: ["seventh", "sevenths"], 8: ["eighth", "eighths"], 9: ["ninth", "ninths"], 10: ["tenth", "tenths"],
  11: ["eleventh", "elevenths"], 12: ["twelfth", "twelfths"],
};
export const partName = (d: number, n = 2) => NAMES[d][n === 1 ? 0 : 1];
const parts = (n: number, d: number) => `${n} ${partName(d, n)}`;
const written = ([n, d]: Frac) => `${n}/${d}`;
const sign = (op: FractionOp) => (op === "add" ? "+" : "-");
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

function properFraction(v: unknown): Frac | null {
  if (!v || typeof v !== "object") return null;
  const f = v as AnswerValue;
  if (f.type !== "fraction" || !Number.isInteger(f.numerator) || !Number.isInteger(f.denominator)) return null;
  return f.numerator > 0 && f.numerator < f.denominator && f.denominator <= 12 ? [f.numerator, f.denominator] : null;
}

/** The checked facts of `a op b`, or null outside the supported forms. */
export function fractionFacts(op: FractionOp, a: Frac, b: Frac): FractionFacts | null {
  const common = Math.max(a[1], b[1]);
  if (common > 12 || common % a[1] !== 0 || common % b[1] !== 0) return null;
  const a2 = a[0] * (common / a[1]);
  const b2 = b[0] * (common / b[1]);
  const result = op === "add" ? a2 + b2 : a2 - b2;
  if (result <= 0 || result >= common) return null;
  const renamed = a[1] === b[1] ? null : a[1] < common ? "a" : "b";
  // The renamed value is the same number: n/d = (n·k)/(d·k).
  if (a2 * a[1] !== a[0] * common || b2 * b[1] !== b[0] * common) return null;
  return { op, a, b, common, renamed, a2, b2, result };
}

export function packageFacts(pkg: OperationPackage): FractionFacts | null {
  const op = pkg.operation.kind === "fraction-add" ? "add" : pkg.operation.kind === "fraction-subtract" ? "subtract" : null;
  if (!op || pkg.answer.unit !== null) return null;
  const [x, y] = pkg.operation.operands as unknown[];
  const a = properFraction(x);
  const b = properFraction(y);
  return a && b ? fractionFacts(op, a, b) : null;
}

/** The question is one of the supported forms and its answer is the checked result. */
export function supportsCheckedFraction(pkg: OperationPackage): boolean {
  const f = packageFacts(pkg);
  const v = pkg.answer.value;
  if (!f || v.type !== "fraction") return false;
  return v.numerator * f.common === f.result * v.denominator;
}

/** The answer a common mistake gives: tops and bottoms combined, or tops combined over unlike parts. */
export function fractionMistake(f: FractionFacts, value: AnswerValue | null): FractionMistake | null {
  if (!value || value.type !== "fraction") return null;
  const combine = (x: number, y: number) => (f.op === "add" ? x + y : x - y);
  const same = (n: number, d: number) => d > 0 && n >= 0 && value.numerator * d === n * value.denominator;
  if (same(combine(f.a[0], f.b[0]), combine(f.a[1], f.b[1]))) return "add_across";
  if (f.renamed && [f.a[1], f.b[1]].some((d) => value.denominator === d && value.numerator === combine(f.a[0], f.b[0]))) return "unlike_parts";
  return null;
}

/** Strip and written-fraction ids. */
const STRIP = { a: "fraction-a", b: "fraction-b" } as const;
const NOTE = { a: "fraction-a-note", b: "fraction-b-note" } as const;
const strip = (id: string, d: number, n: number, place: Record<string, string>) =>
  ({ op: "model", id, model: { kind: "fraction_strip", parts: d, shaded: n }, place }) as unknown as Command;
const note = (id: string, [n, d]: Frac, below: string) =>
  ({ op: "fraction", id, numerator: String(n), denominator: String(d), place: { below } }) as Command;

/** The board: each operand as a strip of one whole with its fraction under it. Nothing shows the result. */
export function fractionShowCommands(f: FractionFacts): Command[] {
  return [
    strip(STRIP.a, f.a[1], f.a[0], { region: "main" }),
    note(NOTE.a, f.a, STRIP.a),
    strip(STRIP.b, f.b[1], f.b[0], { below: NOTE.a }),
    note(NOTE.b, f.b, STRIP.b),
    { op: "focus", target: { objectId: STRIP.a, part: "whole" } } as Command,
  ];
}

/** The split: the renamed operand's strip in the common parts, its fraction now written both ways. Same value. */
export function fractionSplitCommands(f: FractionFacts): Command[] {
  if (!f.renamed) return [];
  const side = f.renamed;
  const n2 = side === "a" ? f.a2 : f.b2;
  return [
    { op: "remove", objectId: STRIP[side] } as Command,
    strip(`${STRIP[side]}-split`, f.common, n2, side === "a" ? { region: "main" } : { below: NOTE.a }),
    { op: "remove", objectId: NOTE[side] } as Command,
    note(`${NOTE[side]}-split`, [n2, f.common], `${STRIP[side]}-split`),
    { op: "focus", target: { objectId: `${STRIP[side]}-split`, part: "whole" } } as Command,
  ];
}

/** The related question's board: earlier work goes; only the new question stays, as written fractions. */
export function fractionQuestionCommands(f: FractionFacts): Command[] {
  return [
    { op: "clear", scope: "maya_objects" } as Command,
    { op: "fraction", id: "transfer-a", numerator: String(f.a[0]), denominator: String(f.a[1]), place: { region: "main" } } as Command,
    { op: "write", id: "transfer-op", text: sign(f.op), place: { rightOf: "transfer-a" } },
    { op: "fraction", id: "transfer-b", numerator: String(f.b[0]), denominator: String(f.b[1]), place: { rightOf: "transfer-op" } } as Command,
    { op: "write", id: "transfer-ask", text: "= ?", place: { rightOf: "transfer-b" } },
  ];
}

/** What the strips and the numbers say: the whole, the denominator and the numerator of the first fraction. */
function linkWords(f: FractionFacts): string[] {
  return [
    "Each strip is one whole.",
    `In ${written(f.a)}, the bottom number ${f.a[1]} says the whole has ${f.a[1]} equal parts, and the top number ${f.a[0]} says ${f.a[0]} of them are shaded.`,
  ];
}

const countAsk = (f: FractionFacts) => f.op === "add"
  ? `How many ${partName(f.common)} are there altogether?`
  : `Take away ${parts(f.b2, f.common)}. How many ${partName(f.common)} are left?`;

const splitAsk = (f: FractionFacts) => {
  const [, d] = f.renamed === "a" ? f.a : f.b;
  return `${capital(partName(d))} and ${partName(f.renamed === "a" ? f.b[1] : f.a[1])} are different sizes. Split each ${partName(d, 1)} into ${f.common / d} equal parts to make ${partName(f.common)}. Use the Split button on the board.`;
};
const capital = (w: string) => w[0].toUpperCase() + w.slice(1);

/** The step after the strips: the split for unlike parts, else the count. */
const nextAfterShow = (f: FractionFacts) => (f.renamed ? splitAsk(f) : `Both strips are cut into ${partName(f.common)}, so the parts are the same size. ${countAsk(f)}`);

export const FRACTION_OFFER = "Do you want to try one more like this on your own?";
export const FRACTION_GOODBYE = "Great work today. Bye for now!";

/**
 * Code-owned lesson words. The only quantities come from the checked facts, and no step names the result: the child
 * says it. The related question's turns use its own facts.
 */
export function fractionWords(f: FractionFacts, instruction: FractionInstruction): string[] | null {
  const renamedFrac: Frac | null = f.renamed ? (f.renamed === "a" ? f.a : f.b) : null;
  const renamedN = f.renamed === "a" ? f.a2 : f.b2;
  switch (instruction.step) {
    case "check_parts":
      return [`How many ${partName(f.common)} make one whole?`];
    case "rename_ask":
      return renamedFrac ? [`How many ${partName(f.common)} are the same as ${written(renamedFrac)}?`] : null;
    case "show":
      return [...linkWords(f), nextAfterShow(f)];
    case "misconception":
      return [
        instruction.mistake === "unlike_parts"
          ? `${capital(partName(f.a[1]))} and ${partName(f.b[1])} are different sizes, so we cannot count them together yet.`
          : `The bottom number names the size of the parts. ${f.op === "add" ? "Adding" : "Subtracting"} does not change the size of the parts, so the bottom numbers are not ${f.op === "add" ? "added" : "subtracted"}.`,
        ...linkWords(f).slice(0, 1),
        nextAfterShow(f),
      ];
    case "renamed":
    case "demonstrate":
      return renamedFrac ? [
        ...(instruction.step === "demonstrate" ? [`Watch. I split each ${partName(renamedFrac[1], 1)} into ${f.common / renamedFrac[1]} equal parts.`] : []),
        `Now ${written(renamedFrac)} is ${parts(renamedN, f.common)}. The amount did not change: ${written(renamedFrac)} = ${renamedN}/${f.common}.`,
        countAsk(f),
      ] : null;
    case "count":
      return [countAsk(f)];
    case "count_hint":
      return [`Count the shaded ${partName(f.common)} on the strips again. ${countAsk(f)}`];
    case "name_fraction":
      return [`Yes, that many ${partName(f.common)}. Write it as a fraction. What is the whole answer?`];
    case "simplify":
      return ["That is equal to the answer. The question asks for the simplest form. Can you write it with smaller numbers?"];
    case "correct":
      return ["You found the answer."];
    case "offer":
      return ["You found the answer.", FRACTION_OFFER];
    case "decline":
      return [`Okay. ${FRACTION_GOODBYE}`];
    case "transfer":
      return [`Here is one more: ${written(f.a)} ${f.op === "add" ? "plus" : "minus"} ${written(f.b)}.`, "Try it on your own. What is the answer?",
        ...(instruction.asksSimplest ? ["Write your answer in simplest form."] : [])];
    case "transfer_retry":
      return [f.renamed ? "Make the parts the same size first. Then count the parts." : "The parts are the same size. Count the parts.", `What is ${written(f.a)} ${f.op === "add" ? "plus" : "minus"} ${written(f.b)}?`];
    case "transfer_show":
      return [...linkWords(f).slice(0, 1), ...(renamedFrac ? [`${written(renamedFrac)} is the same as ${parts(renamedN, f.common)}.`] : []), countAsk(f)];
    case "transfer_correct":
      return [`You found the answer. ${FRACTION_GOODBYE}`];
    default:
      return null;
  }
}

/** The help a turn gives: a demonstration, a hint, or none. */
export function fractionHelp(step: FractionStep | undefined, childAction: boolean): "hinted" | "demonstrated" | undefined {
  if (step === "demonstrate" || step === "transfer_show") return "demonstrated";
  if (childAction) return "hinted";
  if (step === "show" || step === "misconception" || step === "rename_ask" || step === "renamed" || step === "count" ||
    step === "count_hint" || step === "name_fraction" || step === "simplify" || step === "transfer_retry") return "hinted";
}

export const fractionText = (f: FractionFacts) => `${written(f.a)} ${sign(f.op)} ${written(f.b)} = ?`;

// ---------- The related question (#1144 pattern) ----------

type Quad = [number, number, number, number];
/** Candidates of the same form and operation, with results already in simplest form. */
const CANDIDATES: Record<FractionOp, { like: Quad[]; related: Quad[] }> = {
  add: {
    like: [[1, 5, 2, 5], [2, 7, 3, 7], [1, 6, 4, 6], [3, 8, 4, 8], [2, 9, 5, 9]],
    related: [[1, 2, 1, 4], [1, 4, 3, 8], [2, 3, 1, 6], [1, 2, 3, 8], [1, 3, 4, 9]],
  },
  subtract: {
    like: [[4, 5, 1, 5], [5, 7, 2, 7], [5, 6, 4, 6], [7, 8, 2, 8], [8, 9, 1, 9]],
    related: [[3, 4, 1, 8], [1, 2, 1, 8], [7, 8, 1, 4], [3, 4, 1, 2], [2, 3, 2, 9]],
  },
};

export const quadFacts = (op: FractionOp, [an, ad, bn, bd]: Quad) => fractionFacts(op, [an, ad], [bn, bd]);

export function readTransferQuad(op: FractionOp, value: unknown): Quad | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const all = [...CANDIDATES[op].like, ...CANDIDATES[op].related];
  return all.find((q) => q.every((x, i) => x === value[i])) ?? null;
}

/** The first candidate that differs from the original, has another answer, and nothing said gives away. */
export function chooseFractionTransfer(f: FractionFacts, disclosed: (q: Quad) => boolean): Quad | null {
  const list = CANDIDATES[f.op][f.renamed ? "related" : "like"];
  const answer = f.result / f.common;
  return list.find((q) => {
    const g = quadFacts(f.op, q);
    if (!g) return false;
    const same = q[0] === f.a[0] && q[1] === f.a[1] && q[2] === f.b[0] && q[3] === f.b[1];
    return !same && g.result / g.common !== answer && !disclosed(q);
  }) ?? null;
}

/** The related question as a checked package for code's own reads. Its reference stays the original question's. */
export function fractionTransferPackage(pkg: OperationPackage, op: FractionOp, q: Quad, asksSimplest: boolean): OperationPackage {
  const g = quadFacts(op, q)!;
  const k = gcd(g.result, g.common);
  const operation = {
    kind: op === "add" ? "fraction-add" as const : "fraction-subtract" as const,
    operands: [{ type: "fraction" as const, numerator: q[0], denominator: q[1] }, { type: "fraction" as const, numerator: q[2], denominator: q[3] }] as [AnswerValue & { type: "fraction" }, AnswerValue & { type: "fraction" }],
  };
  return {
    ...pkg,
    id: `${pkg.id}:transfer`,
    text: `${fractionText(g)}${asksSimplest ? " Write your answer in simplest form." : ""}`,
    answer: { value: { type: "fraction", numerator: g.result / k, denominator: g.common / k }, accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    wrongAnswers: [],
  };
}

/** Code's reads of one child turn, for the lesson map. */
export interface FractionReads {
  previous: FractionStep | undefined;
  /** A right final answer by the question's wording, with no false working (ownTurn). */
  rightWhole: boolean;
  /** An equal fraction the question wants simplified. */
  unsimplified: boolean;
  /** A committed answer that is a known mistake. */
  mistake: FractionMistake | null;
  /** A committed final fraction or number that is wrong for another reason. */
  wrongWhole: boolean;
  /** A count of parts: a whole number, or a fraction of the common parts (its numerator). */
  count: number | null;
  stuck: boolean;
  asksHow: boolean;
  repeat: boolean;
  /** The child already split the parts, or Maya did. */
  split: boolean;
}

/**
 * The lesson map's next step. Support rises only with evidence: a diagnosis question first, the strips after a gap or
 * a request, the split as the child's own action, and Maya's own split only when the child stays stuck.
 */
export function fractionChoice(f: FractionFacts, r: FractionReads): { step: FractionStep; observation?: [FractionSkill, "correct" | "incorrect"] } | null {
  const p = r.previous;
  if (r.repeat && p && p !== "correct") return { step: p };
  if (r.rightWhole) return { step: "correct", observation: ["result", "correct"] };
  if (r.unsimplified) return { step: "simplify", observation: ["simplify", "incorrect"] };
  if (r.mistake) return { step: "misconception", observation: [r.mistake, "incorrect"] };
  if (p === "demonstrate" && !r.split && (r.stuck || r.asksHow)) return { step: "demonstrate" };
  const counting = p === "count" || p === "count_hint" || p === "renamed" || p === "demonstrate" || (p === "show" && !f.renamed) ||
    (p === "misconception" && !f.renamed);
  if (counting) {
    if (r.count === f.result) return { step: "name_fraction", observation: ["count", "correct"] };
    if (r.count !== null) return { step: "count_hint", observation: ["count", "incorrect"] };
    if (r.stuck) return { step: "count_hint" };
  }
  if ((p === "show" || p === "misconception") && f.renamed && !r.split && (r.stuck || r.asksHow)) return { step: "demonstrate" };
  if (p === "check_parts") {
    if (r.count === f.common) return { step: f.renamed ? "rename_ask" : "count", observation: ["unit", "correct"] };
    if (r.count !== null || r.stuck) return { step: "show", ...(r.count !== null ? { observation: ["unit", "incorrect"] as [FractionSkill, "incorrect"] } : {}) };
  }
  if (p === "rename_ask") {
    const n = f.renamed === "a" ? f.a2 : f.b2;
    if (r.count === n) return { step: "count", observation: ["rename", "correct"] };
    if (r.count !== null || r.stuck) return { step: "show", ...(r.count !== null ? { observation: ["rename", "incorrect"] as [FractionSkill, "incorrect"] } : {}) };
  }
  if (p === "name_fraction" && r.wrongWhole) return { step: "count_hint", observation: ["result", "incorrect"] };
  if (!p) {
    if (r.stuck || r.asksHow) return { step: "show" };
    if (r.wrongWhole) return { step: "check_parts", observation: ["result", "incorrect"] };
  }
  return null;
}

export type FractionSkill = "unit" | "rename" | "count" | "simplify" | "result" | FractionMistake;
