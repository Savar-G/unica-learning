// The copy of a v2 question as a question package (#298), for the readers that do not read workbook_item_answers yet
// (Maya, the parent answer view). The answer of record is the item answer row; this copy is written in the same
// transaction. It holds the printed prompt and, in one box for each answer part, the exact value. A part with a unit
// keeps it as the label of its box. The copy has no operation and is not scored by code ("not-checked"), so every reader
// finds it, and none marks from it: v2 marking reads the item answers (UNI-253).
import type { AnswerRegion, Item, QuestionPackage, WorkbookQuestionRef } from "@/lib/question-package";
import { BRACKET_SIGN, tokenText, type AnswerKind, type BookItem, type Face, type FaceToken } from "@/lib/workbook-v2/contract";

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

export function copiedPackage(item: BookItem, ref: WorkbookQuestionRef, level: number): QuestionPackage {
  const regions: AnswerRegion[] = item.answer.parts.map((p) => ({
    id: regionId(p.name), kind: "box", label: p.kind === "quantity" ? p.unit ?? null : null, answer: { type: "number", value: Number(p.value) },
  }));
  const packageItem: Item = { format: regions.length === 1 ? "write-number" : "boxes", scorable: false, parentChecked: false, regions, checks: [], error: null };
  return {
    id: `v2:${item.id}`, ref, templateId: null, textSource: "code", text: promptOf(item.face), item: packageItem,
    answer: null, operation: null, steps: [], skill: { standard: standardOf(item.shape), skills: [] },
    level, difficulty: 2, wrongAnswers: [], easierExample: null,
  };
}
