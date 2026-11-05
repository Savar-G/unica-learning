import type { QuestionPackage } from "./question-package";
import { largestNumber, reasoningSteps } from "./workbook-task-identity";

export const WORK_INSTRUCTION = "Show your work in the white space under a question.";

/** Minimum white space in CSS pixels, separate from the answer box. */
export function questionWorkSpace(p: QuestionPackage, place?: string | null): number {
  if (place === "warm-up" || place === "spot-the-error" || place === "how-do-you-know") return 0;
  // Reading a digit, a place value, or a graph label needs no calculation space.
  if (/\b(?:which digit|value of (?:the )?(?:[a-z]+ )?digit|place value|digit in the|what value does the bar show)\b/i.test(p.text)) return 0;
  if (/\b(?:wholes? and|as a decimal|how many cents is|cents is how many dollars)\b/i.test(p.text)) return 0;
  const moneyGroups = p.text.match(/\b(?:bills|loonies|toonies|quarters|dimes|nickels)\b/g)?.length ?? 0;
  if (moneyGroups >= 2) return moneyGroups >= 3 ? 96 : 64;
  if (reasoningSteps(p) >= 2) return 96;
  if (/\d+\.\d+\s*[+−×÷]|[+−×÷]\s*\d+\.\d+/.test(p.text)) return (p.text.match(/[+−×÷]/g)?.length ?? 0) > 1 ? 96 : 64;
  const template = p.item?.checks.find(c => c.kind === "template" || c.kind === "template-choice");
  let expression = template?.source.answer ?? "";
  if (template && /^[a-zA-Z_]+$/.test(expression)) expression = template.source.derived.find(([name]) => name === expression)?.[1] ?? expression;
  // An unknown template slot can require reversing the arithmetic used for a printed given.
  if (template && /^[a-zA-Z_]+$/.test(expression)) {
    const inverse = template.source.derived.find(([, value]) => new RegExp(`\\b${expression}\\b`).test(value) && /^[a-zA-Z_0-9.+*/()%\s-]+$/.test(value));
    if (inverse && (inverse[1].match(/(?<![*/])[+*/-](?![*/])/g)?.length ?? 0) >= 2) return 96;
  }
  // String joins and conditional answer formatting are not the child's calculation steps.
  const arithmetic = /^[a-zA-Z_0-9.+*/()%\s-]+$/.test(expression) && !/\b(?:str|if|else|int|round)\b/.test(expression);
  if (arithmetic && (expression.match(/(?<![*/])[+*/-](?![*/])/g)?.length ?? 0) >= 2) return 96;
  const printed = (p.text.match(/\d[\d,]*/g) ?? []).map(n => Number(n.replaceAll(",", "")));
  const oneLine = printed.length > 0 && printed.every(n => n < 10 || n % 10 === 0);
  if (largestNumber(p) >= 100 && arithmetic && /[+*/-]/.test(expression)) return oneLine ? 32 : 64;
  if (p.operation && largestNumber(p) >= 100) return oneLine ? 32 : 64;
  // Some template equations have item checks without an operation adapter.
  if (largestNumber(p) >= 100 && /[+−×÷]|\b(?:sum|difference|total|how many.*(?:left|in all))\b/i.test(p.text)) return oneLine ? 32 : 64;
  return 0;
}
