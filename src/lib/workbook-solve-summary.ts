// The solve check's results in plain words for the admin workbook pages (#379, R379-1, R379-2). One state per question
// and one for the draft, so the top box, the chip, the table heading and the question rows always say the same thing:
// a check that timed out or errored is never shown as a disagreement, and a draft with no checks never as agreed.
// Pure: no I/O.
import type { QuestionCheck } from "@/lib/workbook-generator-items";

/** What the checking AI found: agreed with the key, answered otherwise, could not check (an error or a time-out), or
 * did not check. */
export type SolveState = "agreed" | "disagreed" | "errored" | "not-checked";

const DISAGREED = /^the solve check read the printed question another way/;
const ERRORED = /^the solve check could not confirm/;

/** The solve check's part in a question's failed check: "disagreed", "errored", or null when it did not fail it. */
export function failedBySolve(check: QuestionCheck): "disagreed" | "errored" | null {
  if (check.status !== "failed") return null;
  return DISAGREED.test(check.reason) ? "disagreed" : ERRORED.test(check.reason) ? "errored" : null;
}

/**
 * One question's state. The question's own check decides first (the generator marks a question failed when the check of
 * its printed words did not agree); else the verdict of its current printed question's check
 * (`verdict`, undefined when it has none). The caller excludes checks of an earlier wording or picture.
 */
export function questionSolveState(check: QuestionCheck, verdict: "agreed" | "disagreed" | "failed" | undefined): SolveState {
  const failed = failedBySolve(check);
  if (failed) return failed;
  return verdict === "failed" ? "errored" : verdict ?? "not-checked";
}

/** A question's state as a short label for its row. */
export const QUESTION_SOLVE_TEXT: Record<SolveState, string> = {
  agreed: "Checking AI agreed",
  disagreed: "Checking AI disagreed",
  errored: "Checking AI couldn't check it",
  "not-checked": "Checking AI didn't check it",
};

export type SolveTone = "ok" | "bad" | "warn" | "muted";

export interface SolveSummary {
  state: SolveState;
  disagreed: number;
  errored: number;
  /** The draft's result in one plain line, for the top box and the chip. */
  line: string;
  tone: SolveTone;
}

const questions = (n: number) => `${n} ${n === 1 ? "question" : "questions"}`;

/**
 * The draft's result from its questions' states (`states`: one per question the checking AI checked or that failed
 * its check) and whether the checking AI ran at all (`ran`: the run stored at least one check).
 */
export function solveSummary(states: SolveState[], ran: boolean): SolveSummary {
  const disagreed = states.filter((s) => s === "disagreed").length;
  const errored = states.filter((s) => s === "errored").length;
  const unchecked = states.filter((s) => s === "not-checked").length;
  if (!ran && disagreed === 0 && errored === 0) return { state: "not-checked", disagreed, errored, line: "Checking AI didn't run", tone: "muted" };
  if (states.length === 0) return { state: "not-checked", disagreed, errored, line: "Checking AI didn't check any current questions", tone: "muted" };
  const parts = [
    disagreed > 0 && `${questions(disagreed)} still ${disagreed === 1 ? "disagrees" : "disagree"}`,
    errored > 0 && `Checking AI couldn't check ${questions(errored)}`,
    unchecked > 0 && `Checking AI didn't check ${questions(unchecked)}`,
  ].filter((x): x is string => !!x);
  if (parts.length === 0) return { state: "agreed", disagreed, errored, line: "All questions agree", tone: "ok" };
  return { state: disagreed > 0 ? "disagreed" : errored > 0 ? "errored" : "not-checked", disagreed, errored, line: parts.join(" · "), tone: disagreed > 0 ? "bad" : "warn" };
}

/** The heading and note above the table of the questions the checking AI did not confirm; null when there are none. */
export function solveTableText(s: Pick<SolveSummary, "disagreed" | "errored">): { heading: string; note: string } | null {
  const n = s.disagreed + s.errored;
  if (n === 0) return null;
  const these = n === 1 ? "this question" : `these ${n} questions`;
  const intro = "A second AI answered each question the AI wrote, from the printed words and picture only.";
  if (s.errored === 0) {
    return { heading: "The checking AI got a different answer", note: `${intro} For ${these}, its answer was still different from the correct answer after the AI rewrote ${n === 1 ? "it" : "them"}.` };
  }
  if (s.disagreed === 0) {
    return { heading: "The checking AI couldn't check these questions", note: `${intro} For ${these}, it could not give an answer (an error, or it ran out of time), so nobody has confirmed the answer key yet. Check ${n === 1 ? "it" : "them"} by hand.` };
  }
  return {
    heading: "Questions the checking AI did not confirm",
    note: `${intro} For ${questions(s.disagreed)}, its answer was different from the correct answer after the AI rewrote them. For ${questions(s.errored)}, it could not give an answer (an error, or it ran out of time): check those by hand.`,
  };
}

const usdText = (usd: number) => (usd > 0 && usd < 0.005 ? "less than USD 0.01" : `USD ${usd.toFixed(2)}`);

/**
 * The API cost of the checks in one plain line: the total only when every cost is known; else what is known as a
 * lower bound; null when there are no checks.
 */
export function solveCostLine(costs: (number | null)[]): string | null {
  if (costs.length === 0) return null;
  const known = costs.filter((c): c is number => c !== null);
  if (known.length === 0) return "API cost unknown";
  const total = known.reduce((n, c) => n + c, 0);
  if (known.length < costs.length) return `API cost: at least USD ${(Math.floor(total * 100) / 100).toFixed(2)} (some unknown)`;
  return `API cost ${usdText(total)}`;
}

/**
 * An AI model's plain name: "Claude Haiku 5.5" for "anthropic/claude-haiku-5.5"; the scripted fake gets `fake`
 * ("Scripted checker"). The raw id belongs in a tooltip.
 */
export function plainModel(id: string, fake = "Scripted AI"): string {
  if (id === "fake") return fake;
  const name = id.split("/").at(-1) ?? id;
  const words = name.split(/[-_]/).filter(Boolean);
  if (words.length === 0) return id;
  return words.map((w) => (/^gpt$/i.test(w) ? "GPT" : /^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(" ").replace(/^GPT (\d)/, "GPT-$1");
}
