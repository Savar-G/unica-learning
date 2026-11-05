import { likelihoodWord } from "@/lib/workbook-likelihood";
import { digestOf } from "@/lib/workbook-digest";
import type { CurriculumStep, ExpectedMistake, WatchOutPair } from "./types";

export const MISTAKE_WRITER_MODEL = "claude-sonnet-5-5";
export const MISTAKE_VERIFIER_MODEL = "claude-opus-5-5";

/** Every fact supplied to both models. A misconception id alone never selects text. */
export function mistakeContext(step: CurriculumStep, mistake: ExpectedMistake) {
  return {
    skill: step.skill, step: step.number, position: step.position, name: step.name,
    rules: step.rules, change: step.change, example: step.example,
    mistake: { answer: mistake.answer, why: mistake.why, misconception: mistake.misconception },
  };
}

/** A content fingerprint, not an authentication token. Reused text needs a check for each step. */
export function watchOutVerificationHash(step: CurriculumStep, mistake: ExpectedMistake, pair: WatchOutPair): string {
  return digestOf({ context: mistakeContext(step, mistake), wrong: pair.wrong, fix: pair.fix, verifierModel: pair.verifierModel });
}

/** The only pair a generator may read. Missing, rejected, edited or moved pairs fail closed. */
const verificationCache = new WeakMap<WatchOutPair, { input: readonly unknown[]; accepted: boolean }>();
export function verifiedWatchOut(step: CurriculumStep, mistake: ExpectedMistake): WatchOutPair | null {
  const pair = mistake.watchOut;
  if (pair?.verified !== true || pair.verifierModel !== MISTAKE_VERIFIER_MODEL) return null;
  // Every scalar in mistakeContext, plus the pair. Avoid serializing the same text on every template read.
  const input = [step.skill, step.number, step.position, step.name, step.rules, step.change,
    step.example.problem, step.example.answer, mistake.answer, mistake.why, mistake.misconception,
    pair.wrong, pair.fix, pair.verificationHash, pair.verifierModel];
  let cached = verificationCache.get(pair);
  if (!cached || !input.every((value, index) => value === cached!.input[index])) {
    cached = { input, accepted: pair.verificationHash === watchOutVerificationHash(step, mistake, pair)
      && watchOutProblems(pair).length === 0 };
    verificationCache.set(pair, cached);
  }
  return cached.accepted ? pair : null;
}

/** Same printable text limits as the teaching panel in workbook-book.ts, plus D-230. */
export function watchOutProblems(pair: WatchOutPair): string[] {
  const problems: string[] = [];
  for (const field of ["wrong", "fix"] as const) {
    const text = pair[field];
    if (!text.trim() || text.length > 160 || /\(picture:|\b(?:shade|shaded|colou?r|draw|trace|dots?|counters?|ten-frame|picture|chart|graph|bars?)\b/i.test(text) || likelihoodWord(text)) {
      problems.push(`${field} is not printable`);
    }
    const numbers = text.match(/(?<![\w.])\d[\d,]*(?:[ \u00a0\u202f]\d{3})*(?:\.\d+)?/g) ?? [];
    if (numbers.some(number => {
      const whole = number.split(".")[0];
      return Number(whole.replace(/[, \u00a0\u202f]/g, "")) >= 1000 && !/^\d{1,3}(?:,\d{3})+$/.test(whole);
    })) problems.push(`${field} needs commas for thousands`);
  }
  if (`${pair.wrong} ${pair.fix}`.length > 150) problems.push("pair exceeds 150 characters");
  return problems;
}
