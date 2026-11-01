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

const clean = (s: string) => s.toLowerCase().replace(/[−–]/g, "-").replace(/\s+/g, "").replace(/[.]+$/, "").replace(/^x$/, "×");

/** The numbers in an answer, in order, each a fraction [numerator, denominator]: "1 1/2" is 3/2, "9 R 2" is 9 and 2. */
function numbersOf(s: string): [number, number][] {
  const out: [number, number][] = [];
  const t = s.replace(/(\d),(\d{3})/g, "$1$2").replace(/[−–]/g, "-");
  const re = /(-?\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+)|\/(\d+))?/g;
  for (const m of t.matchAll(re)) {
    if (m[2] !== undefined) {
      const negative = m[1].startsWith("-");
      const w = Math.abs(Number(m[1]));
      const d = Number(m[3]);
      out.push([(negative ? -1 : 1) * (w * d + Number(m[2])), d]);
    } else if (m[4] !== undefined) out.push([Number(m[1]), Number(m[4])]);
    else {
      const places = (m[1].split(".")[1] ?? "").length;
      out.push([Math.round(Number(m[1]) * 10 ** places), 10 ** places]);
    }
  }
  return out;
}

const sameNumbers = (a: [number, number][], b: [number, number][]) => a.length > 0 && a.length === b.length && a.every(([n, d], i) => n * b[i][1] === b[i][0] * d);

/**
 * Everything in an answer but its numbers: the units, signs and labels around them, so "5 cm" and "5 m", "3:30 a.m." and
 * "3:30 p.m.", or "5" and "5 km" never count as the same answer. Spaces and dots are dropped ("a.m." is "am"); every
 * number becomes "#".
 */
const wordsOf = (s: string) => s
  .replace(/(\d),(\d{3})/g, "$1$2")
  .replace(/[−–]/g, "-")
  .replace(/-?\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?/g, "#")
  .toLowerCase()
  .replace(/[\s.]+/g, "");

/**
 * Whether the solver's answer is one the key counts as right: the same choice, or the same numbers in the same order
 * with the same words around them (units, a.m. or p.m., "R" for a remainder) and nothing added. A different, missing
 * or added unit or word fails, which fails the question closed: a unit is never converted or assumed.
 */
export function sameAnswer(given: string, right: string[], choice: boolean): boolean {
  if (choice) return right.some((r) => clean(r) === clean(given));
  return right.some((r) => clean(r) === clean(given) || (/\d/.test(r) && sameNumbers(numbersOf(r), numbersOf(given)) && sameWords(r, given)));
}

/**
 * Whether the words around the numbers match: the same units, signs, a.m. or p.m. and "R", and nothing added. A
 * counted name ("12 shells" for 12) fails too, because no list can tell a counted thing from a unit ("5 inches"); the
 * solver is told to write a count as the number only, and a mismatch fails the question closed.
 */
const sameWords = (right: string, given: string) => wordsOf(right) === wordsOf(given);

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
  "Answer every box and choice of every question, as a careful child who reads the question exactly as printed would. Write a box's answer as the child writes it: a count or a plain number as the number only, in digits, with no word after it (12, not 12 shells; 0.5, 3/4, 1 1/2, 9 R 2), an amount with its unit, written as the question writes it (5 cm, $4.75), or a time with a.m. or p.m. when the question uses them (3:30 p.m.). Never convert a unit. For a choice, give one of its options exactly as printed.",
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

