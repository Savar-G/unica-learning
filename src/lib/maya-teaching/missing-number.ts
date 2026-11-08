// The missing-number deriver of Maya's session adapter (Wave A, A3): "244 × ? = 1464", "30 × ? = 16200",
// "13000 − ? = 3000". A stored workbook package has no operation for these; this works out what Maya teaches from it
// at the start of a call, and changes nothing that is printed or stored. Three agreements, or the question stays held:
// 1. the printed text, read by an exact form only (src/lib/maya/missing-number.ts, readPrinted);
// 2. the missing number code computes from it, which must equal the answer key in the box and the template's answer;
// 3. the template's own expression for the printed number (c = a * b, c = a - b), run on the stored slot values,
//    which must give that number from the printed known number and the missing number.
// The package's steps start with the framing step (and the zeros or try step) of missing-number.ts; the easier
// example is found the same way, with smaller numbers. Pure TypeScript: no clock, network or randomness.
import { mayaPackageCheck } from "@/lib/maya/session";
import { missingWork, readPrinted, type MissingMethod, type Printed } from "@/lib/maya/missing-number";
import { printedEquation } from "@/lib/maya/missing-number-text";
import { operationResult, type QuestionPackage } from "@/lib/question-package";
import { templateAnswer, templateAnswerValue, templateNumbers, type TemplateSource } from "@/lib/question-package-template";
import { TEACHING_SOURCE } from "./limits";

/** The item formats a missing number may be printed in: one answer box, or Solve it two ways (only its box is scored). */
const FORMATS: readonly string[] = ["write-number", "two-ways"];

/** The template's answer is a slot or derived name, and its expression for the printed number is that name and the known one. */
export function templateAgrees(source: TemplateSource, printed: Printed, answer: number): boolean {
  const key = templateAnswer(source);
  if (!("answer" in key)) return false;
  const value = templateAnswerValue(key.answer);
  if (value.type !== "number" || value.value !== answer || !/^[a-z]\w*$/i.test(source.answer)) return false;
  const values = templateNumbers(source);
  if (!values || values[source.answer] !== answer) return false;
  const sign = printed.sign === "×" ? "*" : "-";
  return source.derived.some(([name, expression]) => {
    const m = /^([a-z]\w*) ([*-]) ([a-z]\w*)$/i.exec(expression);
    if (!m || m[2] !== sign || values[name] !== printed.total) return false;
    const [left, right] = [values[m[1]], values[m[3]]];
    if (left === undefined || right === undefined) return false;
    const roles = sign === "*"
      ? (left === printed.known && m[3] === source.answer) || (right === printed.known && m[1] === source.answer)
      : left === printed.known && m[3] === source.answer;
    return roles && (sign === "*" ? left * right : left - right) === printed.total;
  });
}

/**
 * The example gives the question away (lesson 11, #724's review): its answer times a power of 10 is the question's
 * answer (2 for 20, 200), its answer is the first digits of the question's (5 for 54, 54 for 540), or it uses a number
 * the question prints (20 × ? = 40 for 40 × ? = 13200).
 */
export function givesAway(question: Printed, answer: number, example: Printed, exampleAnswer: number): boolean {
  for (let n = exampleAnswer; n > 0 && n <= answer; n *= 10) if (n === answer) return true;
  if (exampleAnswer === answer || String(answer).startsWith(String(exampleAnswer))) return true;
  return [example.known, example.total].some((v) => v === question.known || v === question.total);
}

/** Easier examples of the same method, simplest first; the package check keeps the first that is smaller. */
function exampleCandidates(method: MissingMethod, target: Printed): Printed[] {
  const small = [2, 3, 4, 5, 6, 7, 8, 9];
  const times = (knowns: number[], factors: number[]) =>
    knowns.flatMap((known) => factors.map((f): Printed => ({ sign: "×", known, unknownFirst: target.unknownFirst, total: known * f })));
  switch (method) {
    case "divide":
      return times([...small, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21], small);
    case "zeros": {
      const zeros = String(target.known).match(/0+$/)?.[0].length ?? 0;
      return times(small.map((d) => d * 10 ** zeros), small);
    }
    case "try": {
      const knowns = [];
      for (let k = 101; k <= 999 && knowns.length < 40; k++) if (k % 10 !== 0) knowns.push(k);
      return times(knowns, [...small, 1]);
    }
    case "subtract": {
      const out: Printed[] = [];
      // One-digit numbers from 9 down first ("9 − ? = 4"), then two digits.
      const knowns = [9, 8, 7, 6, 5, 4, 3, 2, ...Array.from({ length: 90 }, (_, i) => i + 10)];
      for (const known of knowns) for (let total = Math.ceil(known / 2); total >= 1; total--) out.push({ sign: "−", known, unknownFirst: false, total });
      return out;
    }
  }
}

/** Maya's teaching package for a printed missing number, or null when any agreement or the package check fails. */
export function deriveMissingNumber(printed: QuestionPackage): QuestionPackage | null {
  const item = printed.item;
  if (printed.operation !== null || !item || !item.scorable || !FORMATS.includes(item.format) || item.checks.length !== 1) return null;
  const check = item.checks[0];
  if (check.kind !== "template") return null;
  const region = item.regions.find((r) => r.id === check.region);
  if (region?.kind !== "box" || region.answer?.type !== "number") return null;
  const frame = readPrinted(printed.text);
  const work = frame ? missingWork(frame) : null;
  if (!frame || !work || printedEquation(frame) !== printed.text) return null;
  if (region.answer.value !== work.answer || !templateAgrees(check.source, frame, work.answer)) return null;
  const answer = { type: "number" as const, value: work.answer };
  for (const candidate of exampleCandidates(work.method, frame)) {
    const example = missingWork(candidate);
    if (!example || example.method !== work.method || givesAway(frame, work.answer, candidate, example.answer)) continue;
    const pkg: QuestionPackage = {
      ...printed,
      operationSource: TEACHING_SOURCE,
      operation: work.operation,
      answer: { value: answer, accepted: [], unit: null },
      steps: work.steps,
      wrongAnswers: [{ value: { type: "number", value: work.answer + 1 }, cause: "calculation", description: "Gives a different result.", step: null }],
      easierExample: { text: printedEquation(candidate), operation: example.operation, answer: operationResult(example.operation), steps: example.steps },
    };
    if (mayaPackageCheck(pkg).ok) return pkg;
  }
  return null;
}
