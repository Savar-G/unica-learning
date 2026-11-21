// The child points to a board object to tell Maya what confuses them (#1152). The same structured action as the #1142
// exchange: it names the lesson, the turn, the question and the board revision the screen showed. Pure TypeScript: the
// screen uses it to list what it can point to, and the session uses it to word Maya's checked answer.
import type { Batch } from "@/lib/board";

export const SELECT_RPC = "maya.select";

/** What the server offers while the child may point: the lesson, Maya's turn, the question and the board revision. */
export interface SelectionOffer {
  lessonId: string;
  turnId: string;
  boardRevision: number;
  /** The question text the lesson is about. */
  question: string;
}

/** One tap. `selectionId` is new for each tap, so a retried request does not answer twice. */
export interface SelectionTarget extends SelectionOffer {
  objectId: string;
  /** The batch that drew the object. */
  batchId: string;
  selectionId: string;
}

export interface SelectedObject {
  objectId: string;
  batchId: string;
  boardRevision: number;
}

/** The checked facts of one board object, read from the command that drew it. */
export type ObjectFacts =
  | { kind: "base_ten"; hundreds: number; tens: number; ones: number }
  | { kind: "write"; text: string }
  | { kind: "columns"; operation: "add" | "subtract" | "multiply"; operands: string[] }
  | { kind: "named"; name: string };

export interface SelectableObject {
  objectId: string;
  batchId: string;
  /** A short name for a button. */
  label: string;
  facts: ObjectFacts;
}

/** The session's checked decision. Maya's words are a pure function of it (`selectionWords`). */
export interface SelectionReply {
  boardSelection: 1;
  /** answer: the object is on the current board. changed: the board moved on. removed: the object is gone. */
  result: "answer" | "changed" | "removed";
  facts?: ObjectFacts;
  /** False when the description would say the protected answer. */
  detail?: boolean;
}

export interface SelectionProposal extends SelectionReply {
  target: SelectionTarget;
}

const ID = /^[\w:.-]{1,160}$/;
const isId = (value: unknown): value is string => typeof value === "string" && ID.test(value);

export function readSelectionTarget(value: unknown): SelectionTarget | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { lessonId, turnId, boardRevision, question, objectId, batchId, selectionId } = value as Partial<SelectionTarget>;
  if (!isId(lessonId) || !isId(turnId) || !isId(objectId) || !isId(batchId) || !isId(selectionId) ||
    typeof question !== "string" || !question || question.length > 300 ||
    typeof boardRevision !== "number" || !Number.isSafeInteger(boardRevision) || boardRevision < 0) return null;
  return { lessonId, turnId, boardRevision, question, objectId, batchId, selectionId };
}

export function sameOffer(a: SelectionOffer | undefined, b: SelectionOffer): boolean {
  return !!a && a.lessonId === b.lessonId && a.turnId === b.turnId && a.boardRevision === b.boardRevision && a.question === b.question;
}

const NAMES: Record<string, string> = {
  array: "the array", fraction_strip: "the fraction strip", geometry: "the shape", coordinate_grid: "the grid",
  division: "the division", fraction: "the fraction", number_line: "the number line", place_chart: "the place value chart",
};

function factsOf(command: Record<string, unknown>): ObjectFacts | null {
  const model = command.model as Record<string, unknown> | undefined;
  switch (command.op) {
    case "model":
      if (model?.kind === "base_ten") {
        const [hundreds, tens, ones] = [model.hundreds ?? 0, model.tens, model.ones].map(Number);
        return [hundreds, tens, ones].every((n) => Number.isSafeInteger(n) && n >= 0) ? { kind: "base_ten", hundreds, tens, ones } : null;
      }
      return typeof model?.kind === "string" && NAMES[model.kind] ? { kind: "named", name: NAMES[model.kind] } : null;
    case "write":
      return typeof command.text === "string" && command.text ? { kind: "write", text: command.text } : null;
    case "columns": {
      const operands = Array.isArray(command.operands) ? command.operands.map((o) => (o as { value?: unknown })?.value) : [];
      const operation = command.operation;
      return (operation === "add" || operation === "subtract" || operation === "multiply") && operands.length >= 2 &&
        operands.every((o): o is string => typeof o === "string") ? { kind: "columns", operation, operands } : null;
    }
    default:
      return typeof command.op === "string" && NAMES[command.op] ? { kind: "named", name: NAMES[command.op] } : null;
  }
}

function labelOf(facts: ObjectFacts): string {
  switch (facts.kind) {
    case "base_ten": return "Blocks";
    case "write": return facts.text;
    case "columns": return "Column work";
    case "named": return facts.name.replace(/^the /, "").replace(/^./, (c) => c.toUpperCase());
  }
}

/**
 * The objects Maya drew that are still on the board, in drawing order: the objects of create commands, less the ones a
 * later `remove` or `clear` took away. Annotations (marks, arrows) point at objects and are not listed themselves.
 */
export function selectableObjects(batches: readonly Batch[]): SelectableObject[] {
  const objects = new Map<string, SelectableObject>();
  for (const batch of batches) {
    for (const raw of batch.commands) {
      if (typeof raw !== "object" || raw === null) continue;
      const command = raw as Record<string, unknown>;
      if (command.op === "remove" && typeof command.objectId === "string") objects.delete(command.objectId);
      else if (command.op === "clear" && command.scope === "maya_objects" && command.page === undefined) objects.clear();
      else if (isId(command.id)) {
        const facts = factsOf(command);
        if (facts) objects.set(command.id, { objectId: command.id, batchId: batch.transactionId, label: labelOf(facts), facts });
      }
    }
  }
  return [...objects.values()];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const OPERATION_WORDS = { add: "plus", subtract: "minus", multiply: "times" } as const;

/** Notation read aloud the way a child hears it. */
export function spokenNotation(text: string): string {
  return text.replace(/\s*=\s*/g, " equals ").replace(/\s*\+\s*/g, " plus ").replace(/\s+[-−]\s+/g, " minus ")
    .replace(/\s*[×x]\s*/g, " times ").replace(/\s+/g, " ").trim();
}

function nameOf(facts: ObjectFacts): string {
  switch (facts.kind) {
    case "base_ten": return "the blocks";
    case "write": return "the writing";
    case "columns": return "the column work";
    case "named": return facts.name;
  }
}

function detailOf(facts: ObjectFacts): string[] {
  switch (facts.kind) {
    case "base_ten": {
      const { hundreds, tens, ones } = facts;
      const parts = [...(hundreds ? [plural(hundreds, "hundred", "hundreds")] : []), plural(tens, "ten", "tens"), plural(ones, "one", "ones")];
      const groups = parts.length === 3 ? `${parts[0]}, ${parts[1]} and ${parts[2]}` : parts.join(" and ");
      return [
        "Each long block is one ten and each small square is one.",
        `They show ${groups}, which is ${100 * hundreds + 10 * tens + ones}.`,
      ];
    }
    case "write": return [`It says ${spokenNotation(facts.text)}.`];
    case "columns": return [`It shows ${facts.operands.join(` ${OPERATION_WORDS[facts.operation]} `)}, with each place in its own column.`];
    case "named": return [];
  }
}

/** For the tutor brief: the object the child pointed to before their current words, so Maya answers about it. */
export function pointedNote(facts: ObjectFacts): string {
  const what = facts.kind === "base_ten" ? ` (${detailOf(facts)[1].replace(/^They show /, "").replace(/\.$/, "")})`
    : facts.kind === "write" ? ` ("${facts.text}")`
    : facts.kind === "columns" ? ` (${facts.operands.join(` ${OPERATION_WORDS[facts.operation]} `)} in columns)` : "";
  return `The child pointed to ${nameOf(facts)} on the board${what} and Maya asked what about it is confusing. Answer about that object.`;
}

/**
 * Answer a supported question about the pointed object with checked place-value words.
 */
export function pointedFollowUp(facts: ObjectFacts, question: string): string[] {
  if (!/\b(?:what(?:'s| (?:is|are|do|does))|why (?:is|are)|how (?:big|long|small)|explain|understand|mean\w*|confus\w*)\b/i.test(question)) return [];
  switch (facts.kind) {
    case "base_ten": {
      const long = /\b(?:long|tens)\b/i.test(question);
      const small = /\b(?:small|squares?|ones)\b/i.test(question);
      return [
        ...(long ? ["The long blocks are tens.", "Each long block is ten small squares joined together."] : []),
        ...(small ? ["The small squares are ones."] : []),
      ];
    }
    case "write": return /\b(?:line|writing|notation|equals?|plus|two ways)\b/i.test(question)
      ? ["That line shows the same amount two ways: the whole number, then its tens and ones."] : [];
    case "columns": return /\b(?:columns?|places?|left|right|line up|tens|ones)\b/i.test(question)
      ? ["Each column holds one place: tens on the left and ones on the right."] : [];
    case "named": return [];
  }
}

/** Maya's words for a checked selection. Code owns every quantity: they come from the command that drew the object. */
export function selectionWords(proposal: SelectionReply): string[] | null {
  if (proposal.result === "changed") return ["The board changed after you pointed.", "Point to the part again, or tell me which part you mean."];
  if (proposal.result === "removed") return ["That part is not on the board now.", "Point to something on the board, or tell me which part you mean."];
  if (!proposal.facts) return null;
  return [`You pointed to ${nameOf(proposal.facts)}.`, ...(proposal.detail ? detailOf(proposal.facts) : []), "What about it is confusing?"];
}
