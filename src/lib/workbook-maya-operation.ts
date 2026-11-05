// Teaching data for checked workbook templates (#525). The stored template expression, not printed text or a
// guessed operation that happens to give the key, determines the operation. Unsupported expressions fail closed.
import {
  checkQuestionPackage, operationProblem, operationResult, operationText, sameValue, workedSteps,
  type Operation, type QuestionPackage,
} from "./question-package";
import { templateAnswer, templateAnswerValue, templateNumbers, type TemplateSource } from "./question-package-template";
import type { GeneratedWorkbook } from "./workbook-generator";

/** Keep the original print input. Teaching metadata must not select columns, methods, units or answer-key text. */
export function printedWorkbookQuestion(pkg: QuestionPackage): QuestionPackage {
  if (pkg.operationSource !== "maya") return pkg;
  const original = { ...pkg };
  delete original.operationSource;
  return { ...original, operation: null, answer: null, steps: [], wrongAnswers: [], easierExample: null };
}

function templateOperation(source: TemplateSource, format: string): Operation | null {
  const numbers = templateNumbers(source);
  if (!numbers) return null;
  let expression = source.answer.trim();
  if (expression.startsWith("str(") && expression.endsWith(")")) expression = expression.slice(4, -1).trim();
  // The number-bond templates store q = w - p. Their missing-part key is the sampled p, and their whole key is w.
  // Use that stored relationship only for these forms, never turn a lone place-value or counting slot into a sum.
  if (["missing", "picture"].includes(format) && source.derived.some(([name, value]) => name === "q" && value.trim() === "w - p")) {
    if (expression === "p") return { kind: "subtract", operands: [numbers.w, numbers.q] };
    if (expression === "w") return { kind: "add", operands: [numbers.p, numbers.q] };
  }
  // Resolve an arithmetic result stored under a derived name. A sampled number alone is not an operation.
  for (let i = 0; i <= source.derived.length; i++) {
    const derived = source.derived.find(([name]) => name === expression);
    if (!derived) break;
    expression = derived[1].trim();
  }
  const scalar = "(?:[A-Za-z][A-Za-z0-9_]*|[0-9]+(?:\\.[0-9]+)?)";
  const read = (word: string) => Object.hasOwn(numbers, word) ? numbers[word] : Number(word);
  const fractions = new RegExp(`^Fraction\\(\\s*(${scalar})\\s*,\\s*(${scalar})\\s*\\)\\s*(\\+|-|\\*|/)\\s*Fraction\\(\\s*(${scalar})\\s*,\\s*(${scalar})\\s*\\)$`).exec(expression);
  if (fractions) {
    const kind = fractions[3] === "+" ? "fraction-add" : fractions[3] === "-" ? "fraction-subtract" : fractions[3] === "*" ? "fraction-multiply" : "fraction-divide";
    return { kind, operands: [
      { type: "fraction", numerator: read(fractions[1]), denominator: read(fractions[2]) },
      { type: "fraction", numerator: read(fractions[4]), denominator: read(fractions[5]) },
    ] };
  }
  const binary = new RegExp(`^(${scalar})\\s*(\\+|-|\\*|//|/)\\s*(${scalar})$`).exec(expression);
  if (binary) {
    const a = read(binary[1]), b = read(binary[3]);
    if (![a, b].every(Number.isFinite)) return null;
    const whole = [a, b].every(Number.isSafeInteger);
    const kind = binary[2] === "+" ? (whole ? "add" : "decimal-add")
      : binary[2] === "-" ? (whole ? "subtract" : "decimal-subtract")
        : binary[2] === "*" ? (whole ? "multiply" : "decimal-multiply") : "divide";
    return { kind, operands: [a, b] };
  }
  // More than one arithmetic step retains the expression and its order of operations. The package checker uses
  // its independent arithmetic evaluator. Calls, conditionals, indexing and text are deliberately not translated.
  if (!/^[A-Za-z0-9_\s.+*/()-]+$/.test(expression) || !/[+*/-]/.test(expression) || expression.includes("//") || expression.includes("**")) return null;
  let unknown = false;
  const filled = expression.replace(/[A-Za-z][A-Za-z0-9_]*/g, name => {
    if (!Object.hasOwn(numbers, name)) { unknown = true; return name; }
    return `(${numbers[name]})`;
  });
  return unknown ? null : { kind: "evaluate", operands: [filled.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−")] };
}

/** Add only independently checked teaching data. Leave every existing operation and every printed field intact. */
export function withWorkbookMayaOperation(pkg: QuestionPackage): QuestionPackage {
  if (pkg.operation || !checkQuestionPackage(pkg).ok || !pkg.item || !pkg.item.scorable
    || ["circle", "draw", "colour-or-shade"].includes(pkg.item.format)) return pkg;
  const checks = pkg.item.checks.filter(c => c.kind === "template");
  if (checks.length !== 1 || checks[0].kind !== "template") return pkg;
  const check = checks[0];
  const key = templateAnswer(check.source);
  if (!("answer" in key)) return pkg;
  const answer = templateAnswerValue(key.answer);
  const format = pkg.templateId?.split(":").at(-1) ?? "";
  if (/(?:place-value|digit-value|read-write|read-numeral|compare-order|round-to|round-decimal)/.test(pkg.skill.skills.join(" "))) return pkg;
  const operation = templateOperation(check.source, format);
  if (!operation || operationProblem(operation) || !sameValue(operationResult(operation), answer)) return pkg;
  const region = pkg.item.regions.find(r => r.id === check.region);
  if (region?.kind !== "box" || !region.answer || !sameValue(region.answer, answer)) return pkg;
  // All examples use the same operation kind. The package checker must confirm a smaller example with a different
  // answer, correct worked steps and a valid wrong answer. Minimal targets with no such example stay unchanged.
  const examples: Operation[] = operation.kind === "evaluate" ? [{ kind: "evaluate", operands: ["1 + 1"] }, { kind: "evaluate", operands: ["1 + 2"] }]
    : operation.kind.startsWith("fraction-") ? [2, 3, 1].flatMap(d => [2, 3, 1].map(e => ({ ...operation, operands: [
      { type: "fraction", numerator: 1, denominator: d }, { type: "fraction", numerator: 1, denominator: e },
    ] }) as Operation))
      : [...[0, 1, 2, 3].flatMap(a => [1, 2, 3].map(b => ({ ...operation, operands: [a, b] }) as Operation)),
        { ...operation, operands: [0, 0] } as Operation];
  for (const example of examples) {
    if (operationProblem(example)) continue;
    const candidate: QuestionPackage = {
      ...pkg, operationSource: "maya", operation,
      answer: { value: answer, accepted: [], unit: null }, steps: workedSteps(operation),
      wrongAnswers: [{ value: { type: "number", value: answer.type === "number" ? answer.value + 1 : 0 }, cause: "calculation", description: "Gives a different result.", step: null }],
      easierExample: { text: `${operationText(example)} = ?`, operation: example, answer: operationResult(example), steps: workedSteps(example) },
    };
    if (checkQuestionPackage(candidate).ok) return candidate;
  }
  return pkg;
}

/** Finalize teaching data after selection, fit and book checks. This function does not mutate the draft. */
export function attachWorkbookMayaOperations(draft: GeneratedWorkbook): GeneratedWorkbook {
  return { ...draft, pages: draft.pages.map(page => ({ ...page,
    questions: page.questions.map(q => ({ ...q, package: q.package ? withWorkbookMayaOperation(q.package) : null })),
  })) };
}
