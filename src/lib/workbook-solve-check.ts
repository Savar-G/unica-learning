// The solve check (round 7, R380-12-1): an independent reading of a printed question whose words the AI wrote. A
// separate small model call reads only what the child or parent sees (the text, a description of the picture, what the
// card prints around its boxes, and what each box or choice asks for) and answers it. Its answers are compared with
// the answer key code computed. When they differ, or the check fails, is late or is malformed, the question fails
// closed: the generator writes it again once with the reason, then marks it failed. It is not a generation attempt.
//
// Code-written text needs no check: a relation's (round 6) and a whole-number question's at U1 to U9 (round 7) are
// filled from the same data as the key. Every other printed text with a key is checked: higher levels, and the kinds
// code does not word (fractions, decimals, amounts, times, places, order, compare, sequence, count, pattern).
//
// Behind a seam (Solver): the live adapter is the AI client (aiSolver: the AI never sees the key); the fake answers
// from the key (keySolver), so dry runs stay free.
// Pure TypeScript: no Next.js, React, network, database, clock or randomness.
import { withTimeLimit, type AiClient } from "@/lib/ai-client";
import { valueText, type Figure, type QuestionPackage } from "@/lib/question-package";
import { isCodeWorded } from "@/lib/workbook-generator-items";

/** One answer region as the child sees it: its id and what it asks for. */
export interface PrintedBox {
  id: string;
  asks: string;
}

/** A question as it is printed: nothing of the key, the operation or the AI's data beyond what the page shows. */
export interface PrintedQuestion {
  /** "question", or "easier" for the easier example a parent may read aloud. */
  id: string;
  text: string;
  /** The picture, in words; null for none. */
  picture: string | null;
  /** What the card prints beside the text: a sequence with its blanks, the numbers to order, Sam's answer. */
  shown: string | null;
  boxes: PrintedBox[];
}

/** The key of one box: the forms that count as right (a box), or the choice (a choice). */
export interface KeyedBox {
  question: string;
  box: string;
  right: string[];
  choice: boolean;
}

export interface SolveRequest {
  questions: PrintedQuestion[];
  /** For the fake only: the live solver never sends it. */
  key: KeyedBox[];
}

/** The seam: what the solver answers to the printed questions (unchecked: the check reads its shape). */
export interface Solver {
  readonly model: string;
  solve(request: SolveRequest, signal: AbortSignal): Promise<unknown>;
}

export type SolveVerdict = { status: "agreed" } | { status: "disagreed"; reason: string } | { status: "failed"; reason: string };

/** One check, for the log: the question, what the solver answered, what the key says, the verdict and its time. */
export interface SolveLog {
  id: string;
  model: string;
  questions: PrintedQuestion[];
  answers: unknown;
  key: KeyedBox[];
  verdict: SolveVerdict;
  ms: number;
}

// ---------- What the page prints ----------

const list = (xs: (string | number)[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** A picture in words, as the child sees it. */
export function pictureWords(f: Figure | null | undefined): string | null {
  if (!f) return null;
  switch (f.kind) {
    case "dots": {
      const total = f.groups.reduce((a, b) => a + b, 0);
      if (f.takenAway > 0) return `${total} dots; the last ${f.takenAway} are crossed out.`;
      return f.groups.length === 1 ? `${total} dots.` : `Dots in ${f.groups.length} groups: ${list(f.groups)}.`;
    }
    case "ten-frame": {
      const total = f.counters.reduce((a, b) => a + b, 0);
      const frames = total > 10 ? "Two ten-frames" : "A ten-frame";
      return f.counters.length === 1 ? `${frames} with ${total} counters.` : `${frames} with counters in ${f.counters.length} colours: ${list(f.counters)}.`;
    }
    case "number-line":
      return `A number line from ${f.from} to ${f.to}, a tick every ${f.step}.`;
    case "base-ten":
      return `Base-ten blocks: ${f.hundreds} hundreds flats, ${f.tens} tens rods and ${f.ones} ones cubes.`;
    case "array":
      return `An array of squares: ${f.rows} rows and ${f.columns} columns.`;
    case "pattern":
      return `A row of shapes: ${Array.from({ length: f.length }, (_, i) => (i === f.blank ? "[empty]" : f.core[i % f.core.length])).join(", ")}.`;
  }
}

/** What the card prints beside the text: a sequence's terms and blanks, the numbers to order, Sam's answer. */
function shownWords(p: QuestionPackage): string | null {
  const parts: string[] = [];
  for (const c of p.item?.checks ?? []) {
    if (c.kind === "sequence") parts.push(`The card prints: ${c.terms.map((t) => ("region" in t ? `[box ${t.region}]` : valueText(t))).join(", ")}.`);
    if (c.kind === "order") parts.push(`The card prints the numbers ${c.numbers.map(valueText).join(", ")}, then the boxes ${c.regions.join(", ")} in a row, in that order.`);
  }
  const error = p.item?.error;
  if (error) parts.push(`Sam's work above it ends with the answer ${valueText(error.answer)}.`);
  return parts.length ? parts.join(" ") : null;
}

/** The printed question and its key, or null when it has no box or choice with an answer (nothing to check). */
export function printedQuestion(p: QuestionPackage): { question: PrintedQuestion; key: KeyedBox[] } | null {
  const regions = p.item?.regions ?? [];
  const boxes: PrintedBox[] = [];
  const key: KeyedBox[] = [];
  const operationBoxes = new Set((p.item?.checks ?? []).flatMap((c) => (c.kind === "operation" ? [c.region] : [])));
  for (const r of regions) {
    if (r.kind === "box" && r.answer) {
      boxes.push({ id: r.id, asks: r.label ? `a box labelled "${r.label}"` : "a box for the answer" });
      const accepted = operationBoxes.has(r.id) ? p.answer?.accepted ?? [] : [];
      key.push({ question: "question", box: r.id, right: [r.answer, ...accepted].map(valueText), choice: false });
    }
    if (r.kind === "choice" && r.answer) {
      boxes.push({ id: r.id, asks: `${r.mark} one of: ${r.choices.join(" | ")}${r.label ? ` (${r.label})` : ""}` });
      key.push({ question: "question", box: r.id, right: [r.answer], choice: true });
    }
  }
  if (boxes.length === 0) return null;
  return { question: { id: "question", text: p.text, picture: pictureWords(p.item?.figure), shown: shownWords(p), boxes }, key };
}

/**
 * The questions of a package whose printed words the AI wrote and that have a key, with that key: the question (unless
 * code wrote its text) and its easier example (unless code wrote it). Empty when there is nothing to check.
 */
export function toSolve(p: QuestionPackage): SolveRequest {
  if (isCodeWorded(p) || (p.item?.checks ?? []).some((c) => c.kind === "relation")) return { questions: [], key: [] };
  const main = printedQuestion(p);
  const questions = main ? [main.question] : [];
  const key = main ? [...main.key] : [];
  const e = p.easierExample;
  if (e) {
    questions.push({ id: "easier", text: e.text, picture: null, shown: null, boxes: [{ id: "answer", asks: "a box for the answer" }] });
    key.push({ question: "easier", box: "answer", right: [valueText(e.answer)], choice: false });
  }
  return { questions, key };
}

// ---------- Comparing ----------
//
// The solver's answer is never parsed. Code writes every form the key may be written in (the key is code's own
// canonical text: "1250", "−5", "3/2", "1 1/2", "9 R 2", "2.5 km", "$4.75", "75¢", "1 h 30 min", "3:30 p.m.", "15:30"),
// and the answer must be one of them, character for character, after only spaces at the ends and in runs, the minus
// sign and one closing full stop are evened out. Any other answer fails the question closed, so no reading of a unit,
// a case, a digit group or a decimal can make two different values look the same.

/** Evens out what any writer varies without changing a value: spaces, the minus sign, a closing full stop. */
const even = (s: string) => s.replace(/[−–]/g, "-").replace(/\s+/g, " ").trim().replace(/(?<![ap]\.m)\.$/i, "");

/** A whole number with thousands commas: "1250" is "1,250". */
const grouped = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** The forms of one key text: each rule adds forms of the forms so far. */
const FORMS: ((k: string) => string[])[] = [
  // An improper fraction as a mixed number and back: "3/2" and "1 1/2".
  (k) => {
    const f = /^(-?)(\d+)\/(\d+)$/.exec(k);
    if (f && BigInt(f[3]) > BigInt(0) && BigInt(f[2]) > BigInt(f[3])) {
      const [n, d] = [BigInt(f[2]), BigInt(f[3])];
      return n % d === BigInt(0) ? [] : [`${f[1]}${n / d} ${n % d}/${d}`];
    }
    const m = /^(-?)(\d+) (\d+)\/(\d+)$/.exec(k);
    if (m && BigInt(m[4]) > BigInt(0)) return [`${m[1]}${BigInt(m[2]) * BigInt(m[4]) + BigInt(m[3])}/${m[4]}`];
    return [];
  },
  // Thousands commas in every whole part of four digits or more: "1250 m" and "1,250 m".
  (k) => (/(?<![\d.])\d{4,}/.test(k) ? [k.replace(/(?<![\d.])\d{4,}/g, grouped)] : []),
  // A remainder written close: "9 R 2", "9R2", "9 r 2", "9r2".
  (k) => (/^-?\d+ R \d+$/.test(k) ? [k.replace(/ R /, "R"), k.replace(/ R /, " r "), k.replace(/ R /, "r")] : []),
  // A unit written close to its number, its case kept: "2.5 km" and "2.5km", "1 h 30 min" and "1h 30min".
  (k) => (/\d [A-Za-zµ]/.test(k) && !/ R \d/.test(k) && !/[ap]\.m\.$/.test(k) ? [k.replace(/(\d) (?=[A-Za-zµ])/g, "$1")] : []),
  // A twelve-hour time: "3:30 p.m.", "3:30 pm", "3:30 PM", "3:30 P.M.", "3:30pm", "3:30PM".
  (k) => {
    const t = /^(\d{1,2}:\d{2}) ([ap])\.m\.$/.exec(k);
    if (!t) return [];
    const [time, h] = [t[1], t[2]];
    return [`${time} ${h}m`, `${time} ${h.toUpperCase()}M`, `${time} ${h.toUpperCase()}.M.`, `${time}${h}m`, `${time}${h.toUpperCase()}M`];
  },
];

/** Every form code accepts for one key text, evened out. */
export function keyForms(key: string): Set<string> {
  let forms = [even(key)];
  for (const rule of FORMS) forms = [...forms, ...forms.flatMap((f) => rule(f).map(even))];
  return new Set(forms);
}

/**
 * Whether the solver's answer is one the key counts as right. A choice must be the right option as printed (case kept, so "1 ML" is never "1 mL");
 * a box answer must be one of the forms code writes for the key or an accepted alternative (keyForms). A word-only key
 * ("even") is compared without case. Nothing else passes: no unit is converted, assumed or added, and no number is read
 * from the answer.
 */
export function sameAnswer(given: string, right: string[], choice: boolean): boolean {
  const g = even(given);
  if (choice) return right.some((r) => even(r) === g);
  return right.some((r) => (/^[a-z ]+$/i.test(even(r)) ? even(r).toLowerCase() === g.toLowerCase() : keyForms(r).has(g)));
}

/** The output schema: an answer for each box of each question, and a problem when a question cannot be answered. */
export const SOLVE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["answers", "problem"],
  properties: {
    answers: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["question", "box", "answer"], properties: { question: { type: "string" }, box: { type: "string" }, answer: { type: "string" } } },
    },
    problem: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
};

const SYSTEM = [
  "You check printed math questions from a workbook for a child aged 6 to 12. Each question is given as the child sees it: its text, the picture in words, what the card prints beside the text, and its answer boxes and choices.",
  "Answer every box and choice of every question, as a careful child who reads the question exactly as printed would. Write a box's answer exactly in one of these forms: a count or a plain number as the number only, in digits, with no word after it and no extra zeros (12, not 12 shells; 1250 or 1,250; 0.5; -3), a fraction as 3/4 or 1 1/2, a remainder as 9 R 2, money as $4.75 or 75¢, an amount with its unit symbol as the question writes it (2.5 km, 1 h 30 min), a time as 3:30 p.m. or 15:30. Never convert a unit. For a choice, give one of its options exactly as printed.",
  "Use only what is printed. Do not guess what the writer meant. If a question cannot be answered as printed (it is unclear, it leaves out a number, or its boxes do not take what it asks), say which and why in problem; else problem is null.",
].join("\n");

/** The live solver: the AI client reads only the printed questions, never the key. */
export function aiSolver(ai: AiClient): Solver {
  return {
    model: ai.model,
    solve: (request, signal) => ai.json({
      name: "solve_check",
      system: SYSTEM,
      content: [{ type: "text", text: JSON.stringify({ questions: request.questions }) }],
      schema: SOLVE_SCHEMA,
      effort: "low",
      maxTokens: 4000,
    }, signal),
  };
}

/** The fake solver: it answers each box from the key, so a dry run costs nothing. */
export function keySolver(): Solver {
  return {
    model: "fake",
    solve: async (request) => ({ answers: request.key.map((k) => ({ question: k.question, box: k.box, answer: k.right[0] })), problem: null }),
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The verdict on the solver's output: every box answered as the key says, or why not. */
export function judge(output: unknown, request: SolveRequest): SolveVerdict {
  if (!isObject(output) || !Array.isArray(output.answers) || !(output.problem === null || typeof output.problem === "string")) {
    return { status: "failed", reason: "the solve check's answer was malformed" };
  }
  if (typeof output.problem === "string" && output.problem.trim()) return { status: "disagreed", reason: `a reader could not answer it as printed: ${output.problem.trim().slice(0, 300)}` };
  const answers = output.answers.filter(isObject);
  const wrong: string[] = [];
  for (const k of request.key) {
    const a = answers.find((x) => x.question === k.question && x.box === k.box);
    if (!a || typeof a.answer !== "string") return { status: "failed", reason: `the solve check's answer was malformed: no answer for ${k.question === "easier" ? "the easier example" : `box ${k.box}`}` };
    if (!sameAnswer(a.answer, k.right, k.choice)) wrong.push(`${k.question === "easier" ? "the easier example" : `box ${k.box}`}: a reader of the printed text answers ${JSON.stringify(a.answer.slice(0, 60))}, the key says ${JSON.stringify(k.right[0])}`);
  }
  return wrong.length ? { status: "disagreed", reason: wrong.join("; ") } : { status: "agreed" };
}

/**
 * Checks one package: null when it has nothing the AI wrote with a key; else the verdict and its log entry. A solver
 * that throws, is late (past `ms`) or answers in another shape fails the check.
 */
export async function solveCheck(solver: Solver, p: QuestionPackage, ms: number, now: () => number = () => 0): Promise<SolveLog | null> {
  const request = toSolve(p);
  if (request.questions.length === 0) return null;
  const start = now();
  let answers: unknown = null;
  let verdict: SolveVerdict;
  try {
    answers = await withTimeLimit(ms, (signal) => solver.solve(request, signal));
    verdict = judge(answers, request);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    verdict = { status: "failed", reason: message === "time is up" ? "the solve check was late" : `the solve check failed: ${message.slice(0, 200)}` };
  }
  return { id: p.id, model: solver.model, questions: request.questions, answers, key: request.key, verdict, ms: now() - start };
}

/** The failed check's reason for a question whose solve check did not agree. */
export const solveReason = (v: Exclude<SolveVerdict, { status: "agreed" }>) =>
  `the solve check ${v.status === "failed" ? "could not confirm the answer key" : "read the printed question another way"}: ${v.reason}. Write the text so it asks exactly what the answer key answers, with every number it needs`;

