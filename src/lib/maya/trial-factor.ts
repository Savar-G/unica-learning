// The try-a-number path for a missing factor with a big known factor (244 × ? = 1464): no long division by 244. The
// child tries a whole number for the missing factor; code multiplies it out and says whether the product is less than,
// more than or the same as the number to make. The hint rounds the known factor to the nearest hundred to estimate.
// A reusable module: the missing-number path (missing-number.ts) uses it, and so can any step that divides by a
// 3-digit number when the quotient is one digit, such as (8763 + 30) ÷ 977. Code computes every number here; the
// words are code lines (lines.ts fills them), approved wording pending (D-202). Pure TypeScript.
import type { MissingNumberStep } from "@/lib/question-package";
import { bracketText } from "./missing-number-text";

export type TrialStep = Extract<MissingNumberStep, { kind: "try-factor" }>;

/** The numbers a child may try: 1 to 10, so a missing factor of 9 still has a try on each side. */
export const TRIAL_RANGE = { min: 1, max: 10 } as const;
/** The largest missing factor the path finds by trying: one digit. A bigger one needs another method. */
export const TRIAL_MAX_VALUE = 9;

/** The nearest hundred (at least 100), to estimate with: 244 is close to 200, 977 to 1000, 150 to 200. */
export const roundToHundred = (n: number): number => Math.max(100, Math.round(n / 100) * 100);

/**
 * The try step for factor × ? = total (its id "try" unless given: a part of a longer question may name it "e2"), or null
 * when the missing factor is not a whole number from 1 to 9 or the numbers are not whole numbers in the safe range.
 */
export function trialStep(factor: number, total: number, id = "try"): TrialStep | null {
  if (![factor, total].every((n) => Number.isSafeInteger(n) && n >= 1) || total % factor !== 0) return null;
  const value = total / factor;
  if (value < 1 || value > TRIAL_MAX_VALUE) return null;
  const tries = [];
  for (let v = TRIAL_RANGE.min; v <= TRIAL_RANGE.max; v++) tries.push({ value: v, product: factor * v });
  return { id, kind: "try-factor", factor, total, round: roundToHundred(factor), tries, value };
}

/** The wordings of the try lines (lines.ts merges them into its TEMPLATES). Every number comes from the checked step. */
export const TRIAL_TEMPLATES = {
  "invite.try": [
    "Try a number for the missing number. What is {factor} times your number?",
    "Pick a number to try. Multiply {factor} by it. What do you get?",
    "Let's try a number. What do you get for {factor} times it?",
    "Choose a number for the missing number. Then multiply it by {factor}.",
    "Guess a number first. Then work out {factor} times it.",
  ],
  "trial.point": [
    "Pick a number for the missing number. Multiply {factor} by it. Do you get {total}?",
    "Try one number. Work out {factor} times it. Is it {total}?",
    "Choose a number to try. Multiply it by {factor}. Check it against {total}.",
    "Guess a number. Then work out {factor} times it. Is that {total}?",
    "Try a number. Does {factor} times that number make {total}?",
  ],
  "trial.round": [
    "{factor} is close to {round}. About how many {round}s make {total}?",
    "Round {factor} to {round}. About how many {round}s are close to {total}?",
    "Think of {factor} as about {round}. How many {round}s get close to {total}?",
    "{factor} is near {round}. About how many {round}s make {total}? Try that number.",
    "Use {round} to guess. About how many {round}s make {total}?",
  ],
  "trial.big": [
    "{factor} × {guess} = {product}. That is more than {total}. Try a smaller number.",
    "{factor} × {guess} = {product}. That is too big. Try a smaller number.",
    "{factor} × {guess} makes {product}. That is more than {total}. Go smaller.",
    "{factor} × {guess} = {product}. {product} is bigger than {total}. Try a smaller number.",
    "Let's check: {factor} × {guess} = {product}. That is too big. Try a smaller number.",
  ],
  "trial.small": [
    "{factor} × {guess} = {product}. That is less than {total}. Try a bigger number.",
    "{factor} × {guess} = {product}. That is too small. Try a bigger number.",
    "{factor} × {guess} makes {product}. That is less than {total}. Go bigger.",
    "{factor} × {guess} = {product}. {product} is smaller than {total}. Try a bigger number.",
    "Let's check: {factor} × {guess} = {product}. That is too small. Try a bigger number.",
  ],
} as const satisfies Record<string, readonly string[]>;

export type TrialKey = keyof typeof TRIAL_TEMPLATES;
type Vars = Record<string, string | number>;

/** A line the try step offers, for lines.ts to fill: its id, wording key, numbers, hint level and the answer it needs. */
export interface TrialLine {
  line: "step.invite" | "step.point" | "step.operation" | "check.not_yet";
  key: TrialKey;
  vars: Vars;
  level?: 0 | 1 | 2;
  /** A not-yet line answers one wrong try: the number the child said, which code multiplied out. */
  heard?: string;
}

/** The help lines of the try step, H0 to H2 (H3 shows the tries on each side: showTrial). */
export function trialHelp(step: TrialStep): TrialLine[] {
  const { factor, total, round } = step;
  return [
    { line: "step.invite", key: "invite.try", vars: { factor }, level: 0 },
    { line: "step.point", key: "trial.point", vars: { factor, total }, level: 1 },
    { line: "step.operation", key: "trial.round", vars: { factor, round, total }, level: 2 },
  ];
}

/** "244 × 7 = 1708. That is too big.": one line for each wrong try in the step's range, each needing that try checked wrong. */
export function trialFeedback(step: TrialStep): TrialLine[] {
  return step.tries.filter((t) => t.value !== step.value).map((t) => ({
    line: "check.not_yet",
    key: t.product > step.total ? "trial.big" : "trial.small",
    vars: { factor: step.factor, guess: t.value, product: t.product, total: step.total },
    heard: String(t.value),
  }));
}

/** H3: the tries on each side of the missing factor, never the factor itself. */
export const showTrial = (step: TrialStep): string => bracketText(step);

/** The try's own equation, once the child found it: "244 × 6 = 1464". */
export const trialEquation = (step: TrialStep): string => `${step.factor} × ${step.value} = ${step.total}`;
