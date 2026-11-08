// The two-ways method rules (D-302). This file holds only the types and the per-method AI verdict the reading needs.
// The rules that let code mark a method valid ship apart; until then TWO_WAYS_METHOD_MARKS is off and every two-ways
// item waits for our team. Pure TypeScript: no network, database, clock or Math.random.

export type MethodVerdict = "valid" | "invalid" | "unknown";
export interface MethodCheck { verdict: MethodVerdict; kind: string | null }
export const METHOD_JUDGMENTS = ["solves", "does-not-solve", "unsure"] as const;
export type MethodJudgment = (typeof METHOD_JUDGMENTS)[number];
export interface MethodRule {
  /** Code's answer, as a number or a/b. */
  answer: string;
  /** The printed question, sent with the method region. Never the answer. */
  question: string;
}
export const methodRuleFor = (text: string, _operation: { kind: string } | null | undefined, answer: string): MethodRule => ({ answer, question: text });
/** No method rules yet: no method is valid, and only the AI's does-not-solve is kept as invalid evidence. */
export const checkMethodReading = (_text: string, _rule: MethodRule, judgment: MethodJudgment | null): MethodCheck =>
  ({ verdict: judgment === "does-not-solve" ? "invalid" : "unknown", kind: null });
/** A made-up method for offline route checks and synthetic photos. Never a mark and never sent to a model. */
export function suppliedMethodText(rule: MethodRule, index: number, wrong = false): string {
  if (wrong) return index === 0 ? `${rule.answer} + 1 = ${rule.answer}` : `${rule.answer} + 2 = ${rule.answer}`;
  return index === 0 ? `${rule.answer} + 10 - 10 = ${rule.answer}` : `${rule.answer} × 2 ÷ 2 = ${rule.answer}`;
}
/** Padding on the answer, for offline route checks. */
export const suppliedFilledInText = (rule: MethodRule) => `${rule.answer} + 0 = ${rule.answer}`;
