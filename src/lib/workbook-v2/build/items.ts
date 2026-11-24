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

/** Easy to hard down the side. Scores compare only inside one shape, so only rows of one shape in sequence mix. */
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

/** What is wrong with an answer: the second computation and the worked steps must both end in it. */
function answerProblem(item: BookItem, row: SnapshotRow): string | null {
  const again = row.shape.solveAgain(item.question);
  const { answer, face } = item;
  const by = again.kind !== answer.kind || again.value !== answer.value ? { value: again.value, how: "another" }
    : item.steps.at(-1) !== answer.value ? { value: item.steps.at(-1) ?? "", how: "the worked steps" }
    : null;
  return by && `Sheet "${item.sheetId}", ${item.side} side, question ${item.number} (${face.top} ${face.sign} ${face.bottom}): the answer is "${answer.value}" by one computation and "${by.value}" by ${by.how}.`;
}

export function sheetItems(sheet: SnapshotSheet, childId: string, attempt: number): { items: BookItem[]; problems: string[] } {
  const seed = seedFrom(childId, sheet.id, attempt);
  const used = new Set<string>();
  const items: BookItem[] = SIDES.flatMap((side) =>
    sideItems(sheet.id, side, sheet[side], seed, used).map((item, i) => ({ ...item, id: `${sheet.id}/${attempt}/${side}/${i + 1}`, number: i + 1 })));
  const rows = new Map([...sheet.front.rows, ...sheet.back.rows].map((row) => [row.id, row]));
  const problems = items.map((item) => {
    const row = rows.get(item.rowId);
    return row ? answerProblem(item, row) : null;
  }).filter((p) => p !== null);
  return { items, problems };
}
