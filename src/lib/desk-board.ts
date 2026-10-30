// The picked question on the desk's board (#301, D-184): the board core writes it in columns, in Maya's font, as the
// child sees it on paper: the numbers, the sign and the line, never the answer. Built on the server, so the desk sends
// only the strokes to the browser. Until calls exist (#337), this is all the board shows.
import { applyBatch, boardView, createScene, type Batch } from "@/lib/board";
import { fitView, type PlayStep } from "@/lib/board-svg";
import type { ColumnsQuestion } from "@/lib/desk";

export interface QuestionBoard {
  steps: PlayStep[];
  /** The batch that writes it: the board history (#320) starts with it, so a replay writes the question again. */
  batch: Batch;
  /** The SVG viewBox around the question, with room around it. */
  viewBox: string;
}

/** The question in columns, or null when the board cannot lay it out (a subtraction below zero, or no question). */
export function questionBoard(question: ColumnsQuestion | null): QuestionBoard | null {
  if (!question) return null;
  const [top, bottom] = question.operands;
  const batch = {
    transactionId: "desk-question",
    commands: [{
      op: "columns", id: "question", operation: question.kind,
      operands: [{ id: "top", value: String(top) }, { id: "bottom", value: String(bottom) }],
      place: { region: "main" },
    }],
  };
  const r = applyBatch(createScene(), batch);
  if (!r.ok) return null;
  return { batch, steps: [{ drawn: r.drawn, erased: r.erased, view: boardView(r.scene) }], viewBox: fitView(r.drawn, 0.06) };
}
