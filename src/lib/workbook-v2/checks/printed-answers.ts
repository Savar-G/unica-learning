// The second computation of every answer starts from what a child reads: the drawn rows of the question, taken from the
// rectangles of the page model. A shape that picks, shows or answers a question wrong thus disagrees with itself.
import type { BookItem, Ink, PageModel } from "../contract";
import { canonicalJson } from "../hash";
import type { Shape, ShapeLibrary } from "../shapes";
import { bottom } from "./rects";

type Text = Extract<Ink, { kind: "text" }>;

/** Two texts stand in one row when they share more than half of the height of the lower one. */
function sameRow(a: Text, b: Text): boolean {
  const shared = Math.min(bottom(a.rect), bottom(b.rect)) - Math.max(a.rect.y, b.rect.y);
  return shared > Math.min(a.rect.h, b.rect.h) / 2;
}

/** The text of each printed row: rows from top to bottom, and each row from left to right. */
export function printedRows(ink: readonly Ink[]): string[] {
  const rows: Text[][] = [];
  for (const text of ink.filter((i) => i.kind === "text").sort((a, b) => a.rect.y - b.rect.y)) {
    const row = rows.find(([first]) => sameRow(first, text));
    if (row) row.push(text);
    else rows.push([text]);
  }
  return rows.map((row) => row.sort((a, b) => a.rect.x - b.rect.x).map((t) => t.text).join(""));
}

function problemOf(item: BookItem, rows: readonly string[], shape: Shape | undefined): string | null {
  const printed = shape?.solveAgain(rows);
  if (!printed) return `the printed question cannot be read as ${item.shape}`;
  const { answer } = item;
  const differs = (other: string, by: string) => `the answer is "${answer.value}" by one computation and "${other}" by ${by}`;
  if (printed.answer.kind !== answer.kind || printed.answer.value !== answer.value) return differs(printed.answer.value, "another");
  if (canonicalJson(printed.question) !== canonicalJson(item.question)) return "the page prints another question than the book holds";
  const last = item.steps.at(-1);
  if (last?.text !== answer.value) return differs(last?.text ?? "", "the worked steps");
  return last.marks.length === 0 ? null : "the last worked step is the answer and must draw nothing";
}

/** What is wrong with the answers of a book, in plain words. */
export function checkPrintedAnswers(pages: readonly PageModel[], items: readonly BookItem[], shapes: ShapeLibrary): string[] {
  const questions = new Map(pages.flatMap((p) => p.regions.filter((r) => r.role === "question").map((r) => [r.item, r.ink] as const)));
  return items.flatMap((item) => {
    const rows = printedRows(questions.get(item.id) ?? []);
    const problem = problemOf(item, rows, shapes.get(item.shape));
    return problem ? [`Sheet "${item.sheetId}", ${item.side} side, question ${item.number} (${rows.join(" ")}): ${problem}.`] : [];
  });
}
