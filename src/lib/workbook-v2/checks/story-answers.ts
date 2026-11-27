// The second computation of a word problem starts from its page: the numbers that its text prints, the unit beside its
// answer area, and its formula worked again by code that shares nothing with themes/solver.ts. A filler that prints
// another number, a unit that does not belong to the answer, or a solver that works wrong thus disagrees with the page.
import { answerLine, tokenText, type BookItem, type Ink, type Region } from "../contract";
import { isRecord } from "../shapes/shape";

type Fraction = [bigint, bigint];

/** The value of a formula with exact fractions, or null for anything that is not a formula or not a whole number of 0 or more. */
function evaluate(node: unknown, values: ReadonlyMap<string, number>): Fraction | null {
  if (!isRecord(node)) return null;
  if (typeof node.slot === "string") return values.has(node.slot) ? [BigInt(values.get(node.slot) ?? 0), BigInt(1)] : null;
  if (typeof node.number === "number" && Number.isSafeInteger(node.number)) return [BigInt(node.number), BigInt(1)];
  if (Array.isArray(node.fraction) && node.fraction.length === 2 && node.fraction.every((n) => Number.isSafeInteger(n))) return [BigInt(node.fraction[0]), BigInt(node.fraction[1])];
  const [a, b] = [evaluate(node.left, values), evaluate(node.right, values)];
  if (!a || !b) return null;
  const result: Record<string, Fraction> = { "+": [a[0] * b[1] + b[0] * a[1], a[1] * b[1]], "-": [a[0] * b[1] - b[0] * a[1], a[1] * b[1]], "×": [a[0] * b[0], a[1] * b[1]], "÷": [a[0] * b[1], a[1] * b[0]] };
  const op = typeof node.op === "string" && Object.hasOwn(result, node.op) ? result[node.op] : null;
  if (!op || op[1] === BigInt(0) || op[0] % op[1] !== BigInt(0) || op[0] / op[1] < BigInt(0)) return null;
  return [op[0] / op[1], BigInt(1)];
}

/** The numbers of a story as the item holds them, in the order that its text prints them, or null. */
function slotsOf(question: unknown): { name: string; value: number }[] | null {
  if (!isRecord(question) || !Array.isArray(question.slots)) return null;
  const slots = question.slots.filter((s): s is { name: string; value: number } => isRecord(s) && typeof s.name === "string" && typeof s.value === "number" && Number.isSafeInteger(s.value) && s.value >= 0);
  return slots.length === question.slots.length ? slots : null;
}

const flowOf = (ink: readonly Ink[]) => ink.find((i): i is Extract<Ink, { kind: "flow" }> => i.kind === "flow");
const textsOf = (ink: readonly Ink[]) => ink.filter((i): i is Extract<Ink, { kind: "text" }> => i.kind === "text");

/** What is wrong with a printed word problem, or null. */
export function storyAnswerProblem(item: BookItem, regions: readonly Region[]): string | null {
  const question = regions.find((r) => r.role === "question");
  const flow = question && flowOf(question.ink);
  const slots = slotsOf(item.question);
  if (!question || !flow || !slots) return "the printed question cannot be read as a story";
  const printed = flow.tokens.map(tokenText).join(" ").match(/\d+/g) ?? [];
  const held = slots.map((s) => String(s.value));
  if (printed.join(", ") !== held.join(", ")) return `the text prints the numbers ${printed.join(", ") || "none"} and the question has ${held.join(", ") || "none"}`;
  const [part] = item.answer.parts;
  const units = textsOf(question.ink).map((t) => t.text);
  if (units.length !== 1 || units[0] !== part?.unit) return `the unit beside the answer area is ${units.map((u) => `"${u}"`).join(", ") || "missing"} and the answer is in ${JSON.stringify(part?.unit)}`;
  const solver = isRecord(item.question) ? item.question.solver : undefined;
  const value = evaluate(solver, new Map(slots.map((s) => [s.name, s.value])));
  if (!value || String(value[0]) !== part.value) return `the answer is "${answerLine(item.answer)}" by one computation and "${value ? String(value[0]) : "none"}" by another`;
  const last = item.steps.at(-1);
  if (last?.text !== answerLine(item.answer)) return `the answer is "${answerLine(item.answer)}" by one computation and "${last?.text ?? ""}" by the worked steps`;
  return last.marks.length === 0 ? null : "the last worked step is the answer and must draw nothing";
}
