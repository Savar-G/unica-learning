// Question gates for the workbook generator (spec #850). This module does not start a generator run.
import type { DecisionClient, DecisionQuestion, DecisionResult } from "@/lib/decision-client";
import type { PrintedQuestion } from "@/lib/workbook-solve-check";

export const QUESTION_GATES = ["reading_level", "one_right_answer", "picture_matches", "uses_interest"] as const;
export type QuestionGate = (typeof QUESTION_GATES)[number];

/** Version 2 uses the held-out labelled-set results in docs/workbook-gate-set-report.md. */
export const GATE_THRESHOLD_VERSION = 2;
export const GATE_THRESHOLDS = {
  "typesafe/jev-1.14": {
    reading_level: { enabled: false, threshold: null, reason: "a held-out fold missed the pass bar" },
    one_right_answer: { enabled: true, threshold: 0.03 },
    picture_matches: { enabled: false, threshold: null, reason: "no real picture questions in the samples" },
    uses_interest: { enabled: false, threshold: null, reason: "no real interest questions in the samples" },
  },
  "google/gemini-decision-1": {
    reading_level: { enabled: false, threshold: null, reason: "a held-out fold missed the pass bar" },
    one_right_answer: { enabled: false, threshold: null, reason: "a held-out fold missed the pass bar" },
    picture_matches: { enabled: false, threshold: null, reason: "no real picture questions in the samples" },
    uses_interest: { enabled: false, threshold: null, reason: "no real interest questions in the samples" },
  },
} as const;
export interface GateInput { question: PrintedQuestion; grade: number; interest: string | null }

/** The decision questions that apply to this printed question. */
export function gateRequest(input: GateInput): { input: { type: "text"; text: string }[]; questions: Partial<Record<QuestionGate, DecisionQuestion>> } {
  const { question, grade, interest } = input;
  const questions: Partial<Record<QuestionGate, DecisionQuestion>> = {
    reading_level: { type: "score", instructions: `What is the reading level of this question for grade ${grade}?`, levels: [`too easy to read for grade ${grade}`, `right for grade ${grade}`, "one grade too hard", "two or more grades too hard"] },
    one_right_answer: { type: "noul", instructions: "Does this question have exactly one correct answer?" },
  };
  if (question.picture) questions.picture_matches = { type: "noul", instructions: "Do the numbers and objects in the picture description match the question?" };
  if (interest) questions.uses_interest = { type: "noul", instructions: `Does the question use ${interest}?` };
  return { input: [{ type: "text", text: JSON.stringify(question) }], questions };
}

/** Return the probability that a gate should flag the question. Errors remain errors. */
export async function questionGateProbabilities(client: DecisionClient, input: GateInput, signal: AbortSignal): Promise<{ probabilities: Partial<Record<QuestionGate, number>>; result: DecisionResult }> {
  const request = gateRequest(input);
  const result = await client.decide({ ...request, signal });
  const probabilities: Partial<Record<QuestionGate, number>> = {};
  for (const gate of Object.keys(request.questions) as QuestionGate[]) {
    const answer = result.answers[gate];
    if (gate === "reading_level") {
      if (!answer || answer.type !== "score" || answer.probabilities.length !== 4) throw new Error("invalid reading level answer");
      probabilities[gate] = answer.probabilities[2] + answer.probabilities[3];
    } else {
      if (!answer || answer.type !== "noul") throw new Error(`invalid ${gate} answer`);
      probabilities[gate] = 1 - answer.yes;
    }
  }
  return { probabilities, result };
}

/** Select the best threshold under the false-flag limit. Probabilities are of a failure, not of yes. */
export function calibrateGate(gate: "reading_level" | "one_right_answer", unchanged: readonly number[], changed: readonly number[]) {
  if (!unchanged.length || !changed.length || [...unchanged, ...changed].some((p) => !Number.isFinite(p) || p < 0 || p > 1)) throw new Error("invalid gate probabilities");
  const choices = Array.from({ length: 101 }, (_, n) => {
    const cutoff = n / 100;
    const threshold = gate === "reading_level" ? cutoff : Number((1 - cutoff).toFixed(2));
    const flags = (p: number) => gate === "reading_level" ? p >= threshold : 1 - p < threshold;
    return { cutoff, caught: changed.filter(flags).length, falseFlags: unchanged.filter(flags).length };
  }).filter((x) => x.falseFlags / unchanged.length <= 0.05)
    .sort((a, b) => b.caught - a.caught || a.falseFlags - b.falseFlags || b.cutoff - a.cutoff);
  const best = choices[0];
  if (!best) return null;
  return { threshold: gate === "reading_level" ? best.cutoff : Number((1 - best.cutoff).toFixed(2)), caught: best.caught, falseFlags: best.falseFlags, enabled: best.caught / changed.length >= 0.9 };
}

/** Apply only enabled gates. A missing probability is an error, not a passing result. */
export function gateFlags(model: keyof typeof GATE_THRESHOLDS, probabilities: Partial<Record<QuestionGate, number>>): QuestionGate[] {
  const thresholds = GATE_THRESHOLDS[model];
  return QUESTION_GATES.filter((gate) => {
    const rule = thresholds[gate];
    if (!rule.enabled) return false;
    const probability = probabilities[gate];
    if (probability === undefined || !Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error(`missing or invalid ${gate} probability`);
    return gate === "reading_level" ? probability >= rule.threshold : 1 - probability < rule.threshold;
  });
}
