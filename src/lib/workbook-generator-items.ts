// The generator's items (#311, spec #296): what the AI writes for one question slot, its JSON schema, and how code turns
// it into a question package (#298). The AI writes content only: the words, the numbers of the operation, the expected
// wrong answers with their causes, an easier example of the same operation, the skill (one the plan names) and an item
// format from a closed list. It never writes the answer, a worked step or an answer region: code computes the answer
// and every step from the operation (operationResult, workedSteps), builds the item's regions and checks from the
// format (the answer of every box and choice is computed by code: D-195 spirit, the AI is never the source of math
// truth), and then the checker (checkQuestionPackage) runs on the whole package. It never sets a layout, a font, a size
// or a position: the schema has no field for one, and code takes only the fields named here.
// Pure TypeScript: no Next.js, React, network, database, clock or randomness.
import { BC_SKILL_MAP } from "@/lib/assessment";
import { defaultItem } from "@/lib/question-package-items";
import {
  checkQuestionPackage,
  operationProblem,
  operationResult,
  workedSteps,
  type AnswerRegion,
  type AnswerValue,
  type Item,
  type ItemCheck,
  type Operation,
  type OperationKind,
  type QuestionPackage,
  type WrongAnswer,
} from "@/lib/question-package";

// ---------- What the AI writes ----------

/** The item formats the generator builds. Each but written-reason needs an operation code can compute. */
export const GENERATED_FORMATS = ["write-number", "show-work", "two-ways", "tick-and-number", "spot-the-error", "written-reason"] as const;
export type GeneratedFormat = (typeof GENERATED_FORMATS)[number];

/** Every operation kind the question package computes (a kind missing here fails the build). */
const OPERATION_KINDS = [
  "add", "subtract", "multiply", "divide", "decimal-add", "decimal-subtract", "decimal-multiply",
  "fraction-add", "fraction-subtract", "fraction-multiply", "fraction-divide", "fraction-simplify", "fraction-equivalent",
  "convert", "quantity-add", "quantity-subtract", "quantity-multiply", "money-round", "elapsed-time", "time-add",
  "clock-convert", "evaluate", "solve",
] as const satisfies readonly OperationKind[];
const ALL_KINDS: Exclude<OperationKind, (typeof OPERATION_KINDS)[number]> extends never ? true : false = true;
void ALL_KINDS;

/** Kinds whose operands are plain numbers. */
const NUMBER_KINDS: readonly string[] = ["add", "subtract", "multiply", "divide", "decimal-add", "decimal-subtract", "decimal-multiply"];
/** Kinds whose one operand is an expression or an equation. */
const EXPRESSION_KINDS: readonly string[] = ["evaluate", "solve"];

/** A value as the AI writes it: every field present, null where it does not apply. */
export interface AiValue {
  type: "number" | "fraction" | "mixed" | "quantity" | "compound" | "time" | "text";
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  whole: number | null;
  unit: string | null;
  hours: number | null;
  minutes: number | null;
  period: "a.m." | "p.m." | null;
  parts: { value: number; unit: string }[];
  text: string | null;
}

/** An operation as the AI writes it. */
export interface AiOperation {
  kind: OperationKind;
  /** The numbers or amounts, in order; empty for evaluate and solve. */
  operands: AiValue[];
  /** The expression (evaluate) or equation (solve); else null. */
  expression: string | null;
  /** The unit the answer must be in (convert; amounts and elapsed time when the question asks for one), else null. */
  unit: string | null;
  /** The new denominator of fraction-equivalent, else null. */
  denominator: number | null;
  /** The values of the unknowns of evaluate; else empty. */
  values: { name: string; value: number }[];
}

/** One question slot as the AI fills it. */
export interface AiItem {
  /** The slot id the plan gave. */
  slot: string;
  /** One of the slot's skill ids. */
  skill: string;
  difficulty: 1 | 2 | 3;
  /** The question as the child reads it. */
  text: string;
  format: GeneratedFormat;
  operation: AiOperation | null;
  wrongAnswers: { value: AiValue; cause: string; description: string; step: string | null }[];
  easier: { text: string; operation: AiOperation } | null;
  /** Spot the error: the index of the wrong answer the page shows as Sam's work; else null. */
  shownWrong: number | null;
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const object = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

const VALUE_SCHEMA = object({
  type: { type: "string", enum: ["number", "fraction", "mixed", "quantity", "compound", "time", "text"] },
  value: nullable({ type: "number" }),
  numerator: nullable({ type: "integer" }),
  denominator: nullable({ type: "integer" }),
  whole: nullable({ type: "integer" }),
  unit: nullable({ type: "string" }),
  hours: nullable({ type: "integer" }),
  minutes: nullable({ type: "integer" }),
  period: nullable({ type: "string", enum: ["a.m.", "p.m."] }),
  parts: { type: "array", items: object({ value: { type: "number" }, unit: { type: "string" } }) },
  text: nullable({ type: "string" }),
});

const OPERATION_SCHEMA = object({
  kind: { type: "string", enum: [...OPERATION_KINDS] },
  operands: { type: "array", items: VALUE_SCHEMA },
  expression: nullable({ type: "string" }),
  unit: nullable({ type: "string" }),
  denominator: nullable({ type: "integer" }),
  values: { type: "array", items: object({ name: { type: "string" }, value: { type: "number" } }) },
});

const ITEM_SCHEMA = object({
  slot: { type: "string" },
  skill: { type: "string" },
  difficulty: { type: "integer", enum: [1, 2, 3] },
  text: { type: "string" },
  format: { type: "string", enum: [...GENERATED_FORMATS] },
  operation: nullable(OPERATION_SCHEMA),
  wrongAnswers: {
    type: "array",
    items: object({ value: VALUE_SCHEMA, cause: { type: "string" }, description: { type: "string" }, step: nullable({ type: "string" }) }),
  },
  easier: nullable(object({ text: { type: "string" }, operation: OPERATION_SCHEMA })),
  shownWrong: nullable({ type: "integer" }),
});

/** The output schema of one page or redo call: the filled slots. Content only: no field sets a layout. */
export const ITEMS_SCHEMA = object({ items: { type: "array", items: ITEM_SCHEMA } });

// ---------- From the AI's fields to the package's ----------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A value with only the fields its type uses; the checker judges it. */
function valueFrom(raw: unknown): unknown {
  if (!isObject(raw)) return raw;
  switch (raw.type) {
    case "number":
      return { type: "number", value: raw.value };
    case "fraction":
      return { type: "fraction", numerator: raw.numerator, denominator: raw.denominator };
    case "mixed":
      return { type: "mixed", whole: raw.whole, numerator: raw.numerator, denominator: raw.denominator };
    case "quantity":
      return { type: "quantity", value: raw.value, unit: raw.unit };
    case "compound":
      return { type: "compound", parts: Array.isArray(raw.parts) ? raw.parts.map((p) => (isObject(p) ? { value: p.value, unit: p.unit } : p)) : raw.parts };
    case "time":
      return { type: "time", hours: raw.hours, minutes: raw.minutes, period: raw.period ?? null };
    case "text":
      return { type: "text", value: raw.text };
    default:
      return { type: raw.type };
  }
}

/** An operation in the package's shape, from the AI's fields; the checker judges it. */
function operationFrom(raw: unknown): unknown {
  if (!isObject(raw) || typeof raw.kind !== "string") return raw;
  const operands = Array.isArray(raw.operands) ? raw.operands : [];
  const op: Record<string, unknown> = { kind: raw.kind };
  if (NUMBER_KINDS.includes(raw.kind)) op.operands = operands.map((o) => (isObject(o) ? o.value : o));
  else if (EXPRESSION_KINDS.includes(raw.kind)) op.operands = [raw.expression];
  else if (raw.kind === "quantity-multiply") op.operands = [valueFrom(operands[0]), isObject(operands[1]) ? operands[1].value : operands[1]];
  else op.operands = operands.map(valueFrom);
  if (raw.kind === "fraction-equivalent") op.denominator = raw.denominator;
  if (raw.unit !== null && raw.unit !== undefined) op.unit = raw.unit;
  if (raw.kind === "evaluate" && Array.isArray(raw.values) && raw.values.length > 0) {
    op.values = Object.fromEntries(raw.values.filter(isObject).map((v) => [v.name, v.value]));
  }
  return op;
}

/** The sign a Mixed set item ticks, computed from the operation's kind; null for a kind with no one sign. */
function signOf(kind: OperationKind): string | null {
  if (/(^|-)add$/.test(kind)) return "+";
  if (/(^|-)subtract$/.test(kind)) return "−";
  if (/(^|-)multiply$/.test(kind)) return "×";
  if (/(^|-)divide$/.test(kind)) return "÷";
  return null;
}
const SIGNS = ["+", "−", "×", "÷"];

/** The item of a format, its answers computed by code from the operation's answer. */
function itemFor(format: GeneratedFormat, op: Operation | null, answer: AnswerValue | null, shown: WrongAnswer | null): Item | string {
  if (format === "written-reason") {
    return { format, scorable: false, parentChecked: true, regions: [{ id: "reason", kind: "lines", label: "How do you know?" }], checks: [], error: null };
  }
  if (!op || !answer) return `a ${format} item needs an operation code can compute`;
  const box: AnswerRegion = { id: "answer", kind: "box", label: null, answer };
  const onAnswer: ItemCheck = { kind: "operation", region: "answer" };
  const base = { format, scorable: true, parentChecked: false, error: null };
  switch (format) {
    case "write-number":
      return defaultItem(answer);
    case "show-work":
      return { ...base, regions: [box, { id: "work", kind: "work", label: "Show your work" }], checks: [onAnswer] };
    case "two-ways":
      return {
        ...base,
        regions: [{ id: "method-1", kind: "work", label: "Method 1" }, { id: "method-2", kind: "work", label: "Method 2" }, box],
        checks: [onAnswer],
      };
    case "tick-and-number": {
      const sign = signOf(op.kind);
      if (!sign) return "a Mixed set item needs an operation with +, −, × or ÷";
      return {
        ...base,
        regions: [
          { id: "operation", kind: "choice", mark: "tick", label: "Tick the operation", choices: SIGNS, answer: sign },
          { ...box, label: "Write the answer" },
          { id: "work", kind: "work", label: "Show your work" },
        ],
        checks: [{ kind: "operation-sign", region: "operation" }, onAnswer],
      };
    }
    case "spot-the-error":
      if (!shown) return "a spot-the-error item needs the wrong answer it shows";
      return {
        ...base,
        regions: [
          { id: "right", kind: "choice", mark: "tick", label: "Is it right?", choices: ["Yes", "No"], answer: "No" },
          { ...box, id: "fix", label: "Fix it" },
        ],
        checks: [
          { kind: "yes-no", statement: { kind: "shown-answer" }, region: "right", yes: "Yes", no: "No" },
          { kind: "operation", region: "fix" },
        ],
        error: { answer: shown.value, step: shown.step },
      };
  }
}

/** Code's verdict on one question: checked, "not checked by code" with why, or failed with why. */
export type QuestionCheck =
  | { status: "checked" }
  | { status: "not-checked"; reason: string }
  | { status: "failed"; reason: string };

export interface BuiltQuestion {
  check: QuestionCheck;
  /** The package, when code could build one (also for a failed check, for the reviewer); else null. */
  package: QuestionPackage | null;
  /** The worked step ids of the AI's operation, when it is valid: the names a wrong answer's step may use. */
  stepIds: string[];
}

/** Where a slot's question goes, and what the plan lets it be. */
export interface SlotPlace {
  /** The package's stable id. */
  id: string;
  workbookId: string;
  page: number;
  question: number;
  level: number;
  /** The skill ids the plan aims the slot at. */
  skills: readonly string[];
}

const fail = (reason: string, pkg: QuestionPackage | null = null, stepIds: string[] = []): BuiltQuestion => ({ check: { status: "failed", reason }, package: pkg, stepIds });

/** The standard (BC code) a skill id belongs to, or null. */
const standardOf = (skill: string) => BC_SKILL_MAP.standards.find((s) => s.skills.some((k) => k.id === skill))?.code ?? null;

/**
 * One slot's question: the AI's item made into a package with code's answer, steps, easier example answer and item,
 * then checked. Never throws: anything code cannot build is a failed question with the reason.
 */
export function buildQuestion(raw: unknown, place: SlotPlace): BuiltQuestion {
  try {
    return build(raw, place);
  } catch (e) {
    return fail(`code could not build the question: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function build(raw: unknown, place: SlotPlace): BuiltQuestion {
  if (!isObject(raw)) return fail("the AI wrote nothing for this question");
  const format = raw.format as GeneratedFormat;
  if (!GENERATED_FORMATS.includes(format)) return fail("the item format is not one the generator builds");
  if (typeof raw.skill !== "string" || !place.skills.includes(raw.skill)) return fail(`the skill ${String(raw.skill)} is not one the plan asks for here (${place.skills.join(", ")})`);
  const standard = standardOf(raw.skill);
  if (!standard) return fail(`the skill ${raw.skill} is not in the BC skill map`);

  let op: Operation | null = null;
  let answer: AnswerValue | null = null;
  let stepIds: string[] = [];
  if (format !== "written-reason" && raw.operation !== null) {
    const candidate = operationFrom(raw.operation);
    const problem = operationProblem(candidate);
    if (problem) return fail(`the operation: ${problem}`);
    op = candidate as Operation;
    answer = operationResult(op);
    stepIds = workedSteps(op).map((s) => s.id);
  }

  const wrongAnswers: WrongAnswer[] = op && Array.isArray(raw.wrongAnswers)
    ? raw.wrongAnswers.filter(isObject).map((w) => ({
      value: valueFrom(w.value) as AnswerValue, cause: w.cause as string, description: w.description as string, step: (w.step ?? null) as string | null,
    }))
    : [];
  const shown = format === "spot-the-error" && typeof raw.shownWrong === "number" ? (wrongAnswers[raw.shownWrong] ?? null) : null;
  const item = itemFor(format, op, answer, shown);
  if (typeof item === "string") return fail(item, null, stepIds);

  let easierExample: QuestionPackage["easierExample"] = null;
  if (op) {
    const easier = isObject(raw.easier) ? raw.easier : null;
    if (!easier) return fail("the question has no easier example", null, stepIds);
    const easierOp = operationFrom(easier.operation);
    const problem = operationProblem(easierOp);
    if (problem) return fail(`the easier example's operation: ${problem}`, null, stepIds);
    easierExample = {
      text: easier.text as string,
      operation: easierOp as Operation,
      answer: operationResult(easierOp as Operation),
      steps: workedSteps(easierOp as Operation),
    };
  }

  const pkg: QuestionPackage = {
    id: place.id,
    ref: { source: "workbook", workbookId: place.workbookId, page: place.page, question: place.question },
    templateId: null,
    text: raw.text as string,
    item,
    answer: op && answer ? { value: answer, accepted: [], unit: null } : null,
    operation: op,
    steps: op ? workedSteps(op) : [],
    skill: { standard, skills: [raw.skill] },
    level: place.level,
    difficulty: raw.difficulty as QuestionPackage["difficulty"],
    wrongAnswers,
    easierExample,
  };
  const check = checkQuestionPackage(pkg);
  switch (check.status) {
    case "checked":
      return { check: { status: "checked" }, package: pkg, stepIds };
    case "not-checked":
    case "unsupported":
      return { check: { status: "not-checked", reason: check.reason }, package: pkg, stepIds };
    case "failed":
      return fail(check.reason, pkg, stepIds);
  }
}
