// Teaching data for checked workbook templates (#525). Derive the method from the printed relationship and its
// unknown. The template source checks the key only. Equal results do not prove that a method fits the question.
import {
  checkQuestionPackage, operationProblem, operationResult, operationText, sameValue, workedSteps,
  type AnswerValue, type Operation, type OperationLimits, type QuestionPackage,
} from "./question-package";
import { templateAnswer, templateAnswerValue } from "./question-package-template";
import { readNumbers } from "./number-words";
import type { GeneratedWorkbook } from "./workbook-generator";

/** Keep the original print input. Teaching metadata must not select columns, methods, units or answer-key text. */
export function printedWorkbookQuestion(pkg: QuestionPackage): QuestionPackage {
  if (pkg.operationSource !== "maya" && pkg.operationSource !== "maya-teaching") return pkg;
  const original = { ...pkg };
  delete original.operationSource;
  return { ...original, operation: null, answer: null, steps: [], wrongAnswers: [], easierExample: null };
}

const NUMBER = "-?\\d+(?:\\.\\d+)?";
const UNKNOWN = "(?:\\?|_+)";
const WORDS = "[a-z][a-z '\\-]*?";
const ACTOR = "(?<who>[a-z]+)";
const SUBJECT = "(?:\\k<who>|he|she|they)";
const THINGS = `(?<things>${WORDS})`;
const n = (name: string) => `(?<${name}>${NUMBER})`;
/** The pieces of a closed printed form, for the closed forms Maya's session adapter adds (src/lib/maya-teaching). */
export const FORM_PARTS = { NUMBER, UNKNOWN, WORDS, ACTOR, SUBJECT, THINGS, n } as const;

export function binary(sign: string, a: number, b: number): Operation {
  const whole = [a, b].every(Number.isSafeInteger);
  if (sign === "/" && !whole) return { kind: "evaluate", operands: [`${a} ÷ ${b}`] };
  const kind = sign === "+" ? (whole ? "add" : "decimal-add")
    : sign === "-" ? (whole ? "subtract" : "decimal-subtract")
      : sign === "*" ? (whole ? "multiply" : "decimal-multiply") : "divide";
  return { kind, operands: [a, b] };
}

/** Read only an entire printed numeric expression. No slot names, derived bindings or answer expressions enter here. */
export function expressionOperation(expression: string): Operation | null {
  const fraction = new RegExp(`^(${NUMBER})/(\\d+)\\s*([+*/-])\\s*(${NUMBER})/(\\d+)$`).exec(expression);
  if (fraction) {
    const kind = fraction[3] === "+" ? "fraction-add" : fraction[3] === "-" ? "fraction-subtract" : fraction[3] === "*" ? "fraction-multiply" : "fraction-divide";
    return { kind, operands: [
      { type: "fraction", numerator: Number(fraction[1]), denominator: Number(fraction[2]) },
      { type: "fraction", numerator: Number(fraction[4]), denominator: Number(fraction[5]) },
    ] };
  }
  const pair = new RegExp(`^(${NUMBER})\\s*([+*/-])\\s*(${NUMBER})$`).exec(expression);
  if (pair) return binary(pair[2], Number(pair[1]), Number(pair[3]));
  if (!/^[\d\s.+*/()-]+$/.test(expression) || readNumbers(expression).length < 2 || !/[+*/-]/.test(expression) || expression.includes("**") || expression.includes("//")) return null;
  return { kind: "evaluate", operands: [expression.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−")] };
}

/** Invert the printed relationship at its unknown, including a numeric expression on the other side of '='. */
function equationOperation(text: string): Operation | null {
  const sides = text.split("=").map(s => s.trim());
  if (sides.length !== 2) return expressionOperation(text);
  for (const [unknown, known] of [sides, [...sides].reverse()]) {
    if (new RegExp(`^${UNKNOWN}$`).test(unknown)) return expressionOperation(known);
    const first = new RegExp(`^${UNKNOWN}\\s*([+*/-])\\s*(${NUMBER})$`).exec(unknown);
    const last = new RegExp(`^(${NUMBER})\\s*([+*/-])\\s*${UNKNOWN}$`).exec(unknown);
    if (!first && !last) continue;
    const sign = first ? first[1] : last![2];
    const given = first ? first[2] : last![1];
    const inverse = sign === "+" ? `${known} - ${given}`
      : sign === "*" ? `${known} / ${given}`
        : sign === "-" ? (first ? `${known} + ${given}` : `${given} - ${known}`)
          : first ? `${known} * ${given}` : `${given} / ${known}`;
    if (new RegExp(`^${NUMBER}$`).test(known)) return expressionOperation(inverse);
    if (!expressionOperation(known)) return null;
    const grouped = sign === "+" ? `(${known}) - ${given}` : sign === "*" ? `(${known}) / ${given}`
      : sign === "-" ? (first ? `(${known}) + ${given}` : `${given} - (${known})`)
        : first ? `(${known}) * ${given}` : `${given} / (${known})`;
    return expressionOperation(grouped);
  }
  return null;
}

// Closed printed story and number-bond forms. Named captures bind printed quantities to their roles. Unmatched
// wording stays unsupported even when the source's answer expression happens to produce the key.
export type PrintedForm = readonly [string, (v: Record<string, string>) => Operation | null];
const PRINTED_FORMS: readonly PrintedForm[] = [
  [`${n("whole")} is ${n("part")} and (?:${UNKNOWN}|which number: ${NUMBER} or ${NUMBER}\\?)`, v => binary("-", +v.whole, +v.part)],
  [`${n("whole")} is ${n("a")} and ${n("b")} and ${UNKNOWN}`, v => expressionOperation(`${v.whole} - ${v.a} - ${v.b}`)],
  [`(?:${NUMBER} and ${NUMBER} make ${NUMBER}\\. )?${n("part")} and ${UNKNOWN} make ${n("whole")}`, v => binary("-", +v.whole, +v.part)],
  [`${UNKNOWN} and ${n("part")} make ${n("whole")}`, v => binary("-", +v.whole, +v.part)],
  [`Whole ${n("whole")}, part ${n("part")}\\. Other part\\?`, v => binary("-", +v.whole, +v.part)],
  [`${n("part")} ${WORDS}\\. How many more make ${n("whole")}\\?`, v => binary("-", +v.whole, +v.part)],
  [`${n("whole")} ${WORDS}: ${n("part")} red, the rest blue\\. How many (?:are )?blue\\?`, v => binary("-", +v.whole, +v.part)],
  [`${ACTOR} has ${n("a")} ${THINGS} and gets ${n("b")} more\\. How many \\k<things> now\\?`, v => binary("+", +v.a, +v.b)],
  [`${ACTOR} has ${n("a")} ${THINGS}\\. ${SUBJECT} gets ${n("b")} more\\. How many \\k<things> does \\k<who> have (?:now|in all)\\?`, v => binary("+", +v.a, +v.b)],
  [`${ACTOR} has ${n("a")} ${THINGS}\\. ${SUBJECT} gets ${n("b")} more, then ${n("c")} more\\. How many \\k<things> does \\k<who> have now\\?`, v => expressionOperation(`${v.a} + ${v.b} + ${v.c}`)],
  [`${ACTOR} has ${n("a")} ${THINGS}\\. ${SUBJECT} (?:gives away|gives) ${n("b")}(?: away)?\\. How many \\k<things> (?:does \\k<who> have left|are left)\\?`, v => binary("-", +v.a, +v.b)],
  [`${ACTOR} picks ${n("a")} ${THINGS}\\. ${SUBJECT} eats ${n("b")} of them\\. How many \\k<things> are left\\?`, v => binary("-", +v.a, +v.b)],
  [`${ACTOR} has ${n("a")} ${THINGS}\\. ${SUBJECT} gives ${n("b")} away, then gets ${n("c")} more\\. How many \\k<things> does \\k<who> have now\\?`, v => expressionOperation(`${v.a} - ${v.b} + ${v.c}`)],
  [`${ACTOR} has ${n("part")} ${THINGS} and wants ${n("whole")}\\. How many more \\k<things> does \\k<who> need\\?`, v => binary("-", +v.whole, +v.part)],
  [`${ACTOR} scores ${n("a")} points\\. A friend scores ${n("b")} points\\. How many more points does \\k<who> score\\?`, v => binary("-", +v.a, +v.b)],
  [`${ACTOR} buys ${n("groups")} packs of ${n("size")} ${THINGS}\\. How many \\k<things> is that\\?`, v => binary("*", +v.groups, +v.size)],
  [`${ACTOR}'s school orders ${n("groups")} boxes with ${n("size")} ${THINGS} in each\\. How many \\k<things> is that\\?`, v => binary("*", +v.groups, +v.size)],
  [`Each ${WORDS} holds ${n("size")} ${THINGS}\\. ${ACTOR} fills ${n("groups")} of them\\. How many \\k<things> is that\\?`, v => binary("*", +v.size, +v.groups)],
  [`A bus carries ${n("size")} people\\. How many people can ${n("groups")} buses carry\\?`, v => binary("*", +v.size, +v.groups)],
  [`A rule says: multiply the position number by ${n("size")}\\. What is the value at position ${n("groups")}\\?`, v => binary("*", +v.size, +v.groups)],
  [`${ACTOR}'s school orders ${n("a")} boxes with ${n("b")} ${THINGS} in each\\. It gives away ${n("c")} \\k<things>\\. How many \\k<things> does the school have now\\?`, v => expressionOperation(`${v.a} * ${v.b} - ${v.c}`)],
  [`${ACTOR}'s school sends ${n("a")} full buses of ${n("b")} people to a game, and ${n("c")} people leave early\\. How many people are still at the game\\?`, v => expressionOperation(`${v.a} * ${v.b} - ${v.c}`)],
  [`A plant is ${n("a")} cm tall and grows ${n("b")} cm each week\\. How tall is it after ${n("c")} weeks\\?`, v => expressionOperation(`${v.a} + ${v.b} * ${v.c}`)],
];
type PrintedRelationship = { pattern: RegExp; build: PrintedForm[1] };
/** Closed forms as anchored, case-blind patterns. */
export const printedRelationships = (forms: readonly PrintedForm[]): PrintedRelationship[] =>
  forms.map(([pattern, build]) => ({ pattern: new RegExp(`^${pattern}\\.?$`, "i"), build }));
const PRINTED_RELATIONSHIPS = printedRelationships(PRINTED_FORMS);

/**
 * The operation of an entire printed text: a numeric equation or expression, then the closed forms. `extra`: more closed
 * forms after the #525 ones, only for a caller that passes them (Maya's session adapter); generation passes none.
 */
export function printedOperation(text: string, extra: readonly PrintedRelationship[] = []): Operation | null {
  const printed = text.replace(/\d{1,3}(?:,\d{3})+/g, value => value.replace(/,/g, ""))
    .replace(/[−–]/g, "-").replace(/×/g, "*").replace(/÷/g, "/").replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  const equation = printed.replace(/^(?:Missing number: |Fill the blank: )/i, "").replace(/\.$/, "");
  const operation = equationOperation(equation.replace(/^What is (.*)\?$/i, "$1"));
  if (operation) return operation;
  for (const { pattern, build } of [...PRINTED_RELATIONSHIPS, ...extra]) {
    const match = pattern.exec(printed);
    if (match?.groups) return build(match.groups);
  }
  return null;
}

/** This is an additional provenance check, not proof that equal arithmetic describes the printed relationship. */
export function hasPrintedOperands(operation: Operation, text: string): boolean {
  const printed = new Set(readNumbers(text).map(n => n.value));
  const operands = operation.kind === "evaluate" ? readNumbers(operation.operands[0]).map(n => n.value)
    : operation.operands.flatMap(value => typeof value === "number" ? [value]
      : typeof value === "object" && value.type === "fraction" ? [value.numerator, value.denominator] : []);
  return operands.length > 0 && operands.every(value => printed.has(value));
}

/** Add only independently checked teaching data. Preserve original builder operations and every printed field. */
export function withWorkbookMayaOperation(pkg: QuestionPackage): QuestionPackage {
  pkg = printedWorkbookQuestion(pkg);
  if (pkg.operation || !checkQuestionPackage(pkg).ok || !pkg.item || !pkg.item.scorable
    || ["circle", "draw", "colour-or-shade"].includes(pkg.item.format)) return pkg;
  const checks = pkg.item.checks.filter(c => c.kind === "template");
  if (checks.length !== 1 || checks[0].kind !== "template") return pkg;
  const check = checks[0];
  const key = templateAnswer(check.source);
  if (!("answer" in key)) return pkg;
  const answer = templateAnswerValue(key.answer);
  if (/(?:place-value|digit-value|read-write|read-numeral|compare-order|round-to|round-decimal)/.test(pkg.skill.skills.join(" "))) return pkg;
  const operation = printedOperation(pkg.text);
  if (!operation || !hasPrintedOperands(operation, pkg.text) || operationProblem(operation) || !sameValue(operationResult(operation), answer)) return pkg;
  const region = pkg.item.regions.find(r => r.id === check.region);
  if (region?.kind !== "box" || !region.answer || !sameValue(region.answer, answer)) return pkg;
  return withTeachingOperation(pkg, operation, answer) ?? pkg;
}

/**
 * The package with checked teaching data for `operation` (its answer, worked steps, one wrong answer and an easier
 * example), or null when no candidate passes the package check. The caller has checked that the operation fits the
 * printed question and its key. `source`, `limits` and `examples`: only Maya's session adapter passes them
 * ("maya-teaching", its wider limits, and easier examples of the question's own shape, tried instead of the list
 * below); generation passes none, so the #525 output is as before.
 */
export function withTeachingOperation(pkg: QuestionPackage, operation: Operation, answer: AnswerValue,
  options: { source?: "maya" | "maya-teaching"; limits?: OperationLimits; examples?: readonly Operation[] } = {}): QuestionPackage | null {
  // All examples use the same operation kind. The package checker must confirm a smaller example with a different
  // answer, correct worked steps and a valid wrong answer. Minimal targets with no such example stay unchanged.
  const examples: readonly Operation[] = options.examples ?? (operation.kind === "evaluate" ? [{ kind: "evaluate", operands: ["1 + 1"] }, { kind: "evaluate", operands: ["1 + 2"] }]
    : operation.kind.startsWith("fraction-") ? [2, 3, 1].flatMap(d => [2, 3, 1].map(e => ({ ...operation, operands: [
      { type: "fraction", numerator: 1, denominator: d }, { type: "fraction", numerator: 1, denominator: e },
    ] }) as Operation))
      : [...[0, 1, 2, 3].flatMap(a => [1, 2, 3].map(b => ({ ...operation, operands: [a, b] }) as Operation)),
        { ...operation, operands: [0, 0] } as Operation]);
  for (const example of examples) {
    if (operationProblem(example, options.limits)) continue;
    const candidate: QuestionPackage = {
      ...pkg, operationSource: options.source ?? "maya", operation,
      answer: { value: answer, accepted: [], unit: null }, steps: workedSteps(operation),
      wrongAnswers: [{ value: { type: "number", value: answer.type === "number" ? answer.value + 1 : 0 }, cause: "calculation", description: "Gives a different result.", step: null }],
      easierExample: { text: `${operationText(example)} = ?`, operation: example, answer: operationResult(example), steps: workedSteps(example) },
    };
    if (checkQuestionPackage(candidate, undefined, options.limits).ok) return candidate;
  }
  return null;
}

/** Finalize teaching data after selection, fit and book checks. This function does not mutate the draft. */
export function attachWorkbookMayaOperations(draft: GeneratedWorkbook): GeneratedWorkbook {
  return { ...draft, pages: draft.pages.map(page => ({ ...page,
    questions: page.questions.map(q => ({ ...q, package: q.package ? withWorkbookMayaOperation(q.package) : null })),
  })) };
}
