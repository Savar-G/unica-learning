// The pattern deriver needs the exact printed form, template identity, template expression, slot roles and key.
import { checkQuestionPackage, operationResult, sameValue, workedSteps, type QuestionPackage } from "@/lib/question-package";
import { templateAnswer, templateAnswerValue, templateNumbers } from "@/lib/question-package-template";
import { exampleGivesAway, patternText, readPattern, type PatternForm } from "@/lib/maya/pattern";
import { TEACHING_SOURCE } from "./limits";

const TEMPLATES: Record<PatternForm, [string, string, string | null]> = {
  missing3: ["5.10-pattern-rule#1.3:missing", "d", "s + 2 * d"],
  missing9: ["5.10-pattern-rule#1.6:missing", "d", "s + 8 * d"],
  term4: ["5.10-pattern-rule#1.1:bare", "s + 3 * d", null],
  plant3: ["5.10-pattern-rule#1.2:story", "s + 3 * d", null],
  pair: ["5.10-pattern-rule#1.5:bare", "2 * s + 8 * d", null],
  days8: ["5.10-pattern-rule#1.7:story", "s + 8 * d", null],
};

export function derivePattern(printed: QuestionPackage): QuestionPackage | null {
  const item = printed.item;
  if (printed.operation || !item || !item.scorable || item.error !== null || !["write-number", "show-work"].includes(item.format) || item.checks.length !== 1) return null;
  if (printed.skill.standard !== "5.10" || printed.skill.skills.length !== 1 || printed.skill.skills[0] !== "5.10-pattern-rule") return null;
  const p = readPattern(printed.text);
  const check = item.checks[0];
  if (!p || p.step < 2 || check.kind !== "template") return null;
  const [id, expression, derived] = TEMPLATES[p.form];
  const source = check.source;
  // Exact expression roles prevent equal-valued, unrelated template calculations from passing.
  if (printed.templateId !== id || source.answer !== expression || source.values !== null ||
      JSON.stringify(source.derived) !== JSON.stringify(derived ? [["t", derived]] : []) ||
      source.slots.length !== 2 || !source.slots.some(s => s.name === "s") || !source.slots.some(s => s.name === "d")) return null;
  const values = templateNumbers(source);
  const key = templateAnswer(source);
  const box = item.regions.find(r => r.id === check.region);
  const answer = operationResult(p.operation);
  if (!values || values.s !== p.start || values.d !== p.step || (p.missing && values.t !== p.start + p.count * p.step) ||
      !("answer" in key) || !sameValue(templateAnswerValue(key.answer), answer) || box?.kind !== "box" || !box.answer || !sameValue(box.answer, answer)) return null;
  // The easier pattern: the same printed form with a start and a step of 5 or less, never one that gives the question away.
  for (const start of [1, 2, 3, 4, 5]) for (const step of [2, 3, 4, 5, 1]) {
    const small = readPattern(patternText(p.form, start, step))!;
    if (exampleGivesAway(p, small)) continue;
    const easierExample = { text: small.text, operation: small.operation, answer: operationResult(small.operation), steps: workedSteps(small.operation) };
    const made: QuestionPackage = { ...printed, operationSource: TEACHING_SOURCE, operation: p.operation,
      answer: { value: answer, accepted: [], unit: null }, steps: workedSteps(p.operation), wrongAnswers: [{ value: { type: "number" as const, value: (answer.type === "number" ? answer.value : 0) + 1 }, cause: "calculation", description: "Gives a different result.", step: null }], easierExample };
    if (checkQuestionPackage(made).ok) return made;
  }
  return null;
}
