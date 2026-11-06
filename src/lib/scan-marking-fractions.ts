// Exact fraction and mixed-number response checking. No decimal extraction.
import { equivalent, isRightAnswer, valueText, type NumberValue, type Operation, type PackageAnswer } from "@/lib/question-package";
import { exactNumber } from "@/lib/scan-marking-numbers";

export interface FractionRule {
  answer: NumberValue;
  operationRule: { operation: Operation; answer: PackageAnswer } | null;
  requiresSimplest: boolean;
}

function fractionValue(text: string): NumberValue | null {
  const number = exactNumber(text, false);
  if (number !== null) return { type: "number", value: number };
  const m = text.match(/^([+-]?)(?:(\d+)\s+)?(\d+)\s*\/\s*([+-]?\d+)$/);
  if (!m) return null;
  // A denominator sign in a mixed number has no unambiguous whole-number scope.
  if (m[2] !== undefined && /^[+-]/.test(m[4])) return null;
  const whole = Number(m[2] ?? 0), numerator = Number(m[3]), denominator = Number(m[4]);
  if (![whole, numerator, denominator].every(Number.isSafeInteger)) return null;
  if (m[2] !== undefined && m[1] !== "-" && denominator >= 0) return { type: "mixed", whole, numerator, denominator };
  const n = (BigInt(whole) * BigInt(Math.abs(denominator)) + BigInt(numerator)) * BigInt(m[1] === "-" ? -1 : 1) * BigInt(denominator < 0 ? -1 : 1);
  if (n < -BigInt(Number.MAX_SAFE_INTEGER) || n > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { type: "fraction", numerator: Number(n), denominator: Math.abs(denominator) };
}

function simplest(value: NumberValue): boolean {
  if (value.type === "number") return Number.isSafeInteger(value.value) && value.value >= 0;
  if (value.numerator < 0 || value.denominator < 2) return false;
  if (value.type === "mixed" && (value.whole < 1 || value.numerator < 1 || value.numerator >= value.denominator)) return false;
  let a = BigInt(value.numerator), b = BigInt(value.denominator);
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a === BigInt(1);
}

/** Null means untyped writing. A clear zero denominator is a typed, wrong answer. */
export function checkFractionReading(text: string, rule: FractionRule): { value: string; result: "right" | "wrong" } | null {
  const value = fractionValue(text);
  if (!value) return null;
  const valid = value.type === "number" || value.denominator !== 0;
  const right = valid && (!rule.requiresSimplest || simplest(value)) && (rule.operationRule
    ? isRightAnswer(rule.operationRule.operation, rule.operationRule.answer, value)
    : equivalent(rule.answer, value));
  return { value: valueText(value), result: right ? "right" : "wrong" };
}
