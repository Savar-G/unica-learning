// Turns the rows of a sheet into the questions of one child. The seed is the child, the sheet and the attempt.
import type { BookItem, Side } from "../contract";
import { canonicalJson, seedFrom } from "../hash";
import type { SnapshotRow, SnapshotSheet, SnapshotSide } from "../bank/snapshot";

const SIDES: readonly Side[] = ["front", "back"];

/**
 * How often a place asks for a question that the sheet does not have yet. A sheet has few places, so when a row has more
 * questions than that, most tries succeed; a row that has none left uses one again.
 */
const TRIES = 500;

type RowItem = Omit<BookItem, "number" | "id">;

function rowItems(sheetId: string, side: Side, row: SnapshotRow, seed: string, used: Set<string>): RowItem[] {
  return Array.from({ length: row.items }, (_, place) => {
    let picked = row.shape.generate(row.limits, seedFrom(seed, side, row.id, place, 0));
    const key = () => `${row.shape.id} ${canonicalJson(picked.question)}`;
    for (let attempt = 1; used.has(key()) && attempt < TRIES; attempt++) {
      picked = row.shape.generate(row.limits, seedFrom(seed, side, row.id, place, attempt));
    }
    used.add(key());
    const { question, answer } = picked;
    return {
      sheetId, side, rowId: row.id, shape: row.shape.id, question, answer,
      face: row.shape.face(question), steps: row.shape.steps(question), difficulty: row.shape.difficulty(question),
    };
  });
}

/**
 * Easy to hard down the side: the difficulty decides the order and questions of two rows may mix. Questions of equal
 * difficulty keep the row order of the bank (the sort is stable). Scores compare only inside one shape, so only rows of
 * one shape in sequence mix. Each item names its row.
 */
function sideItems(sheetId: string, side: Side, content: SnapshotSide, seed: string, used: Set<string>): RowItem[] {
  const runs: RowItem[][] = [];
  for (const row of content.rows) {
    const items = rowItems(sheetId, side, row, seed, used);
    const run = runs.at(-1);
    if (run && run[0].shape === row.shape.id) run.push(...items);
    else runs.push(items);
  }
  return runs.flatMap((run) => run.sort((a, b) => a.difficulty - b.difficulty));
}

/** The questions of one sheet, with the answers of the first computation (checks/printed-answers.ts has the second). */
export function sheetItems(sheet: SnapshotSheet, childId: string, attempt: number): BookItem[] {
  const seed = seedFrom(childId, sheet.id, attempt);
  const used = new Set<string>();
  return SIDES.flatMap((side) =>
    sideItems(sheet.id, side, sheet[side], seed, used).map((item, i) => ({ ...item, id: `${sheet.id}/${attempt}/${side}/${i + 1}`, number: i + 1 })));
}
