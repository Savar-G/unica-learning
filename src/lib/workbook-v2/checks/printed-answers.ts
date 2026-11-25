// The second computation of every answer starts from what a child reads: the drawn rows of the question, taken from the
// rectangles of the page model. A shape that picks, shows or answers a question wrong thus disagrees with itself.
import { answerLine, type Answer, type BookItem, type Ink, type PageModel, type Rect, type Region } from "../contract";
import { canonicalJson } from "../hash";
import type { Shape, ShapeLibrary } from "../shapes";
import { bottom, EPSILON } from "./rects";

type Text = Extract<Ink, { kind: "text" }>;

/** How a blank reads in a row: a character that no page prints. */
export const BLANK = "□";
interface Piece { rect: Rect; text: string }

/** Two pieces stand in one row when they share more than half of the height of the lower one. */
function sameRow(a: Piece, b: Piece): boolean {
  const shared = Math.min(bottom(a.rect), bottom(b.rect)) - Math.max(a.rect.y, b.rect.y);
  return shared > Math.min(a.rect.h, b.rect.h) / 2;
}

/** The text of each printed row: rows from top to bottom, and each row from left to right. `blanks` are answer areas. */
export function printedRows(ink: readonly Ink[], blanks: readonly Rect[] = []): string[] {
  const pieces: Piece[] = [...ink.filter((i): i is Text => i.kind === "text"), ...blanks.map((rect) => ({ rect, text: BLANK }))];
  const rows: Piece[][] = [];
  for (const piece of pieces.sort((a, b) => a.rect.y - b.rect.y)) {
    const row = rows.find(([first]) => sameRow(first, piece));
    if (row) row.push(piece);
    else rows.push([piece]);
  }
  return rows.map((row) => row.sort((a, b) => a.rect.x - b.rect.x).map((t) => t.text).join(""));
}

/** The printed rows of one question. An answer area is a blank of them when it stands beside or inside the question, and not below it. */
export function questionRows(regions: readonly Region[]): string[] {
  const question = regions.find((r) => r.role === "question");
  if (!question) return [];
  const { rect, ink } = question;
  return printedRows(ink, regions.filter((r) => r.role === "answer" && r.rect.y < bottom(rect) - EPSILON && bottom(r.rect) > rect.y + EPSILON).map((r) => r.rect));
}

const shown = (answer: Answer): string => (answer.parts.length === 1 ? answerLine(answer) : answer.parts.map((p) => `${p.name} ${p.value}`).join(", "));

function problemOf(item: BookItem, rows: readonly string[], shape: Shape | undefined): string | null {
  const printed = shape?.solveAgain(rows);
  if (!printed) return `the printed question cannot be read as ${item.shape}`;
  const { answer } = item;
  const differs = (other: string, by: string) => `the answer is "${shown(answer)}" by one computation and "${other}" by ${by}`;
  if (canonicalJson(printed.answer) !== canonicalJson(answer)) return differs(shown(printed.answer), "another");
  if (canonicalJson(printed.question) !== canonicalJson(item.question)) return "the page prints another question than the book holds";
  const last = item.steps.at(-1);
  if (last?.text !== answerLine(answer)) return differs(last?.text ?? "", "the worked steps");
  return last.marks.length === 0 ? null : "the last worked step is the answer and must draw nothing";
}

/** The rectangles of each question of the pages. */
export function regionsByItem(pages: readonly PageModel[]): Map<string, Region[]> {
  const found = new Map<string, Region[]>();
  for (const region of pages.flatMap((p) => p.regions)) {
    if (region.item === null) continue;
    const own = found.get(region.item);
    if (own) own.push(region);
    else found.set(region.item, [region]);
  }
  return found;
}

/** What is wrong with the answers of a book, in plain words. */
export function checkPrintedAnswers(pages: readonly PageModel[], items: readonly BookItem[], shapes: ShapeLibrary): string[] {
  const regions = regionsByItem(pages);
  return items.flatMap((item) => {
    const rows = questionRows(regions.get(item.id) ?? []);
    const problem = problemOf(item, rows, shapes.get(item.shape));
    return problem ? [`Sheet "${item.sheetId}", ${item.side} side, question ${item.number} (${rows.join(" ")}): ${problem}.`] : [];
  });
}
