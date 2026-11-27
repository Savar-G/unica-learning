// The second computation of a word problem starts from its page: the numbers and fractions that its text prints, the unit
// beside its answer area, and its formula worked again by code that shares nothing with themes/solver.ts. A filler that
// prints another number or fraction, a wrong unit, or a wrong worked step thus disagrees with the page.
import { answerLine, tokenText, type BookItem, type Ink, type Region } from "../contract";
import { isRecord } from "../shapes/shape";

interface EvalValue { n: bigint; d: bigint; text: string }
const GLYPHS: Readonly<Record<string, string>> = { "1/2": "½", "1/4": "¼", "3/4": "¾" };

/** The value, worked step lines and fractions of a formula with exact BigInt arithmetic, or null for anything invalid. */
function evaluate(node: unknown, values: ReadonlyMap<string, number>, lines: string[], fractions: string[]): EvalValue | null {
  if (!isRecord(node)) return null;
  if (typeof node.slot === "string") {
    const value = values.get(node.slot);
    return value === undefined ? null : { n: BigInt(value), d: BigInt(1), text: String(value) };
  }
  if (typeof node.number === "number" && Number.isSafeInteger(node.number)) return { n: BigInt(node.number), d: BigInt(1), text: String(node.number) };
  if (Array.isArray(node.fraction) && node.fraction.length === 2 && node.fraction.every((n) => typeof n === "number" && Number.isSafeInteger(n))) {
    const key = `${node.fraction[0]}/${node.fraction[1]}`;
    const glyph = Object.hasOwn(GLYPHS, key) ? GLYPHS[key] : null;
    if (!glyph) return null;
    fractions.push(glyph);
    return { n: BigInt(node.fraction[0]), d: BigInt(node.fraction[1]), text: glyph };
  }
  const [a, b] = [evaluate(node.left, values, lines, fractions), evaluate(node.right, values, lines, fractions)];
  if (!a || !b) return null;
  const result: Record<string, [bigint, bigint]> = { "+": [a.n * b.d + b.n * a.d, a.d * b.d], "-": [a.n * b.d - b.n * a.d, a.d * b.d], "×": [a.n * b.n, a.d * b.d], "÷": [a.n * b.d, a.d * b.n] };
  const op = typeof node.op === "string" && Object.hasOwn(result, node.op) ? result[node.op] : null;
  if (!op || op[1] === BigInt(0) || op[0] % op[1] !== BigInt(0) || op[0] / op[1] < BigInt(0)) return null;
  const value = op[0] / op[1];
  lines.push(`${a.text} ${node.op} ${b.text} = ${value}`);
  return { n: value, d: BigInt(1), text: String(value) };
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
  if (flow.tokens.some((t) => t.kind === "word" && /[½¼¾]/.test(tokenText(t)))) return "the text prints a fraction as a word instead of math";
  const [part] = item.answer.parts;
  const units = textsOf(question.ink).map((t) => t.text);
  if (units.length !== 1 || units[0] !== part?.unit) return `the unit beside the answer area is ${units.map((u) => `"${u}"`).join(", ") || "missing"} and the answer is in ${JSON.stringify(part?.unit)}`;
  const solver = isRecord(item.question) ? item.question.solver : undefined;
  const lines: string[] = [];
  const formulaFractions: string[] = [];
  const value = evaluate(solver, new Map(slots.map((s) => [s.name, s.value])), lines, formulaFractions);
  if (!value || value.d !== BigInt(1) || String(value.n) !== part.value) return `the answer is "${answerLine(item.answer)}" by one computation and "${value && value.d === BigInt(1) ? String(value.n) : "none"}" by another`;
  const printedFractions = flow.tokens.flatMap((t) => tokenText(t).match(/[½¼¾]/g) ?? []).sort();
  const wantedFractions = [...formulaFractions].sort();
  if (printedFractions.join(", ") !== wantedFractions.join(", ")) return `the text prints the fractions ${printedFractions.join(", ") || "none"} and the formula has ${wantedFractions.join(", ") || "none"}`;
  const last = item.steps.at(-1);
  if (last?.text !== answerLine(item.answer)) return `the answer is "${answerLine(item.answer)}" by one computation and "${last?.text ?? ""}" by the worked steps`;
  if (last.marks.length !== 0) return "the last worked step is the answer and must draw nothing";
  const worked = item.steps.slice(0, -1);
  if (worked.length !== lines.length || worked.some((s, i) => s.text !== lines[i])) return `the worked steps are ${JSON.stringify(worked.map((s) => s.text))} and another computation gives ${JSON.stringify(lines)}`;
  return worked.some((s) => s.marks.length !== 0) ? "a worked step of a word problem must draw nothing" : null;
}
