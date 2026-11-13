// The words of the missing-number steps (missing-number.ts, trial-factor.ts): what a board or a voice says for each,
// filled only from the checked step. A leaf module with no runtime imports, so question-package-math.ts can say these
// steps without an import cycle. Plain language (D-202): short sentences, one idea each, never "in all" or "total".
// The spoken sentences call the ? "the missing number"; only the printed equation keeps its "?".
import type { MissingNumberStep } from "@/lib/question-package";

type Frame = Extract<MissingNumberStep, { kind: "missing-frame" }>;
type Zeros = Extract<MissingNumberStep, { kind: "drop-zeros" }>;
type Trial = Extract<MissingNumberStep, { kind: "try-factor" }>;

/** The printed equation of a frame, as the workbook prints it: "244 × ? = 1464", "? × 30 = 16200", "13000 − ? = 3000". */
export const printedEquation = (f: Pick<Frame, "sign" | "known" | "unknownFirst" | "total">): string =>
  f.unknownFirst ? `? ${f.sign} ${f.known} = ${f.total}` : `${f.known} ${f.sign} ? = ${f.total}`;

/** The operation that finds the missing number: "1464 ÷ 244", "13000 − 3000". */
export const inverseText = (f: Pick<Frame, "inverse" | "from" | "by">): string => `${f.from} ${f.inverse} ${f.by}`;

/** "1 zero", "2 zeros". */
export const zerosText = (n: number): string => `${n} ${n === 1 ? "zero" : "zeros"}`;

/** The division a drop-zeros step leaves: "1620 ÷ 3". */
export const reducedText = (z: Pick<Zeros, "toFrom" | "toBy">): string => `${z.toFrom} ÷ ${z.toBy}`;

/** The product of one try, or null for a number not in the step's tries. */
export const tryProduct = (t: Trial, value: number): number | null => t.tries.find((x) => x.value === value)?.product ?? null;

/** One try in words: "244 × 7 = 1708. That is more than 1464." */
export function tryText(t: Trial, value: number): string | null {
  const product = tryProduct(t, value);
  if (product === null) return null;
  const how = product > t.total ? `That is more than ${t.total}.` : product < t.total ? `That is less than ${t.total}.` : "That is it.";
  return `${t.factor} × ${value} = ${product}. ${how}`;
}

/**
 * The try next to the missing factor, never the factor itself: the one just below ("244 × 5 = 1220. That is less than
 * 1464."), or just above for a factor of 1. Maya shows it at H3, so the child still finds the number. One try, so the
 * line fits a 25-word turn with 4-digit numbers said in words.
 */
export function bracketText(t: Trial): string {
  return tryText(t, t.value > 1 ? t.value - 1 : t.value + 1) ?? ""; // trial-factor.ts shownTry: the same try
}

/** A missing-number step in words, for a board, a voice and the easier example. The try step says the number. */
export function missingStepText(step: MissingNumberStep): string {
  switch (step.kind) {
    case "missing-frame":
      return `To find the missing number, work out ${inverseText(step)}.`;
    case "drop-zeros":
      // Said in the easier example: the zeros by the number they end, never as a count (lesson 12: "2 zeros" writes a 2).
      return `Take the zeros of ${step.by} off both numbers. ${step.from} ÷ ${step.by} is the same as ${reducedText(step)}.`;
    // Short enough for a 25-word turn: the try that works. The tries that do not are said when the child makes them.
    case "try-factor":
      return `Try ${step.value}. ${step.factor} × ${step.value} = ${step.total}. So the missing number is ${step.value}.`;
  }
}
