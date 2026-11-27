// The copy of a v2 question as a question package (#298), for the readers that do not read workbook_item_answers yet
// (Maya, the parent answer view). The answer of record is the item answer row; this copy is written in the same
// transaction. Single-answer arithmetic and story items carry a checked Operation, worked steps, and an easier example
// when checkQuestionPackage accepts them, so Maya can teach them and parent answer keys keep quantity units via
// answer.unit. Multi-part or minimal items without a smaller example stay "not-checked", with any quantity unit kept in
// the box answer text so parent answer keys never drop units. v2 marking still reads workbook_item_answers (UNI-253).
import {
  checkQuestionPackage,
  operationProblem,
  operationResult,
  operationText,
  sameValue,
  workedSteps,
  type AnswerRegion,
  type AnswerValue,
  type Item,
  type Operation,
  type QuestionPackage,
  type WorkbookQuestionRef,
} from "@/lib/question-package";
import { BRACKET_SIGN, tokenText, type AnswerKind, type BookItem, type Face, type FaceToken } from "@/lib/workbook-v2/contract";
import type { Expr } from "@/lib/workbook-v2/themes/solver";

/** The printed blank of an answer area in a prompt. */
const BLANK = "□";

const tokenLine = (tokens: readonly FaceToken[]): string => tokens.map((t) => ("text" in t ? t.text : BLANK)).join(" ");

/** The question as it prints, in one line of text. */
export function promptOf(face: Face): string {
  switch (face.kind) {
    case "column": return `${face.top} ${face.sign} ${face.bottom}`;
    case "equation": case "sequence": return tokenLine(face.tokens);
    case "bracket": return [tokenLine(face.above), `${face.outside}${BRACKET_SIGN}${face.inside}`].filter((s) => s !== "").join(" ");
    case "fields": return `${face.prompt}: ${face.rows.map((r) => `${r.label} ${BLANK}`).join(", ")}`;
    case "figure": return `${face.figure.parts.join(" | ")} (${face.figure.totalLabel}) ${face.prompt} ${BLANK}`;
    case "story": return `${face.tokens.map(tokenText).join(" ")} ${BLANK} ${face.unit}`;
  }
}

/** The BC standard of a shape: facts of + and -, columns of + and -, and multiplication and division. */
function standardOf(shape: string): string {
  if (shape === "fact.add" || shape === "fact.sub") return "3.4";
  if (shape === "add.column" || shape === "sub.column") return "3.3";
  return "3.5";
}

/** The one kind of all parts of an answer; a question whose parts have two kinds is refused. */
export function answerKindOf(item: BookItem): AnswerKind {
  const kinds = [...new Set(item.answer.parts.map((p) => p.kind))];
  if (kinds.length !== 1) throw new Error(`question ${item.id}: its answer parts have ${kinds.length} kinds`);
  return kinds[0];
}

/** The region id of a part: an id of small letters, digits and dashes, as an item region needs. */
const regionId = (name: string): string => name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+/, "").slice(0, 40) || "answer";

const isWhole = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** One whole-number value of a story expression leaf, or null for fractions or compound sub-expressions. */
function exprLeaf(expr: Expr, values: Readonly<Record<string, number>>): number | null {
  if ("number" in expr) return isWhole(expr.number) ? expr.number : null;
  if ("slot" in expr) return Object.hasOwn(values, expr.slot) && isWhole(values[expr.slot]) ? values[expr.slot] : null;
  return null;
}

/** Formats a whole-number story expression tree for `evaluate`, or null if it uses fractions. */
function exprText(expr: Expr, values: Readonly<Record<string, number>>, nested = false): string | null {
  const leaf = exprLeaf(expr, values);
  if (leaf !== null) return String(leaf);
  if (!("op" in expr)) return null;
  const left = exprText(expr.left, values, true);
  const right = exprText(expr.right, values, true);
  if (left === null || right === null) return null;
  const sign = expr.op === "-" ? "−" : expr.op;
  const text = `${left} ${sign} ${right}`;
  return nested ? `(${text})` : text;
}

/** The operation of a story's formula tree, or null when no single checked operation fits. */
function storyOperation(question: Record<string, unknown>): Operation | null {
  const solver = question.solver as Expr | undefined;
  const slots = question.slots as { name: string; value: number }[] | undefined;
  if (!solver || typeof solver !== "object" || !("op" in solver) || !Array.isArray(slots)) return null;
  const values = Object.fromEntries(slots.map(({ name, value }) => [name, value]));
  const left = exprLeaf(solver.left, values);
  const right = exprLeaf(solver.right, values);
  if (left !== null && right !== null) {
    if (solver.op === "+") return { kind: "add", operands: [left, right] };
    if (solver.op === "-") return { kind: "subtract", operands: [left, right] };
    if (solver.op === "×") return { kind: "multiply", operands: [left, right] };
    if (solver.op === "÷" && right > 0 && left % right === 0) return { kind: "divide", operands: [left, right] };
    return null;
  }
  if (solver.op === "×") {
    if ("fraction" in solver.left && right !== null) {
      return { kind: "fraction-multiply", operands: [{ type: "fraction", numerator: solver.left.fraction[0], denominator: solver.left.fraction[1] }, { type: "number", value: right }] };
    }
    if ("fraction" in solver.right && left !== null) {
      return { kind: "fraction-multiply", operands: [{ type: "number", value: left }, { type: "fraction", numerator: solver.right.fraction[0], denominator: solver.right.fraction[1] }] };
    }
  }
  const text = exprText(solver, values);
  return text ? { kind: "evaluate", operands: [text] } : null;
}

/** The single checked Operation of a single-part v2 item, or null. */
function operationOf(item: BookItem): Operation | null {
  if (item.answer.parts.length !== 1) return null;
  const q = (item.question ?? {}) as Record<string, unknown>;
  switch (item.shape) {
    case "fact.add": case "add.column":
      return isWhole(q.a) && isWhole(q.b) ? { kind: "add", operands: [q.a, q.b] } : null;
    case "fact.sub": case "sub.column":
      return isWhole(q.a) && isWhole(q.b) ? { kind: "subtract", operands: [q.a, q.b] } : null;
    case "fact.mul": case "mul.column":
      return isWhole(q.a) && isWhole(q.b) ? { kind: "multiply", operands: [q.a, q.b] } : null;
    case "div.fact": case "div.long": case "div.remainder":
      return isWhole(q.dividend) && isWhole(q.divisor) && q.divisor > 0 && q.dividend % q.divisor === 0
        ? { kind: "divide", operands: [q.dividend, q.divisor] } : null;
    case "figure.bar":
      return isWhole(q.groups) && isWhole(q.size) ? { kind: "multiply", operands: [q.groups, q.size] } : null;
    case "repeated.add":
      return isWhole(q.count) && isWhole(q.number) ? { kind: "multiply", operands: [q.count, q.number] } : null;
    case "missing.addend":
      return isWhole(q.result) && isWhole(q.known) ? { kind: "subtract", operands: [q.result, q.known] } : null;
    case "missing.factor":
      return isWhole(q.result) && isWhole(q.known) && q.known > 0 && q.result % q.known === 0
        ? { kind: "divide", operands: [q.result, q.known] } : null;
    case "story":
      return storyOperation(q);
    default:
      return null;
  }
}

/** Candidate smaller examples of the same operation kind, tried in order until checkQuestionPackage accepts one. */
function candidateExamples(operation: Operation): Operation[] {
  if (operation.kind === "evaluate") return [{ kind: "evaluate", operands: ["1 + 1"] }, { kind: "evaluate", operands: ["1 + 2"] }];
  if (operation.kind === "fraction-multiply") {
    return [2, 3, 4].map((d) => ({ kind: "fraction-multiply", operands: [{ type: "fraction", numerator: 1, denominator: d }, { type: "number", value: d }] }));
  }
  if (operation.kind === "divide") {
    return [[2, 2], [4, 2], [6, 2], [3, 3], [6, 3], [2, 1], [3, 1], [1, 1]].map(([a, b]) => ({ kind: "divide", operands: [a, b] }));
  }
  if (operation.kind === "add" || operation.kind === "subtract" || operation.kind === "multiply") {
    const [a, b] = operation.operands;
    const pairs: [number, number][] = [
      ...(a > 1 ? [[a - 1, b] as [number, number]] : []),
      ...(b > 1 ? [[a, b - 1] as [number, number]] : []),
      [2, 1], [1, 1], [3, 1], [2, 2], [3, 2], [1, 0], [0, 1], [0, 0],
    ];
    return pairs.map(([x, y]) => ({ kind: operation.kind, operands: [x, y] }) as Operation);
  }
  return [];
}

/** Builds a checked QuestionPackage when an operation and smaller example pass checkQuestionPackage, else null. */
function checkedCopy(item: BookItem, ref: WorkbookQuestionRef, level: number): QuestionPackage | null {
  const operation = operationOf(item);
  if (!operation || operationProblem(operation) !== null) return null;
  const part = item.answer.parts[0];
  const value: AnswerValue = { type: "number", value: Number(part.value) };
  if (!sameValue(operationResult(operation), value)) return null;
  const unit = part.kind === "quantity" ? part.unit ?? null : null;
  const id = regionId(part.name);
  const steps = workedSteps(operation);
  const wrongAnswers = [{ value: { type: "number" as const, value: value.value + 1 }, cause: "calculation", description: "Gives a different result.", step: null }];
  const packageItem: Item = {
    format: "write-number", scorable: true, parentChecked: false,
    regions: [{ id, kind: "box", label: unit, answer: value }],
    checks: [{ kind: "operation", region: id }],
    error: null,
  };
  for (const example of candidateExamples(operation)) {
    if (operationProblem(example) !== null) continue;
    const candidate: QuestionPackage = {
      id: `v2:${item.id}`, ref, templateId: null, textSource: "code", text: promptOf(item.face), item: packageItem,
      answer: { value, accepted: [], unit }, operation, steps, skill: { standard: standardOf(item.shape), skills: [] },
      level, difficulty: 2, wrongAnswers,
      easierExample: { text: `${operationText(example)} = ?`, operation: example, answer: operationResult(example), steps: workedSteps(example) },
    };
    if (checkQuestionPackage(candidate).ok) return candidate;
  }
  return null;
}

export function copiedPackage(item: BookItem, ref: WorkbookQuestionRef, level: number): QuestionPackage {
  const checked = checkedCopy(item, ref, level);
  if (checked) return checked;
  const regions: AnswerRegion[] = item.answer.parts.map((p) => {
    const unit = p.kind === "quantity" ? p.unit ?? null : null;
    const answer: AnswerValue = unit ? { type: "text", value: `${p.value} ${unit}` } : { type: "number", value: Number(p.value) };
    return { id: regionId(p.name), kind: "box", label: unit, answer };
  });
  const packageItem: Item = { format: regions.length === 1 ? "write-number" : "boxes", scorable: false, parentChecked: false, regions, checks: [], error: null };
  return {
    id: `v2:${item.id}`, ref, templateId: null, textSource: "code", text: promptOf(item.face), item: packageItem,
    answer: null, operation: null, steps: [], skill: { standard: standardOf(item.shape), skills: [] },
    level, difficulty: 2, wrongAnswers: [], easierExample: null,
  };
}
