// The sheets of a snapshot for one book: each story row bound to the theme and the region of the book. Other rows stay as
// they are, so a sheet with no word problem is the same object.
import type { SnapshotSheet, SnapshotSide } from "../bank/snapshot";
import { STORY_SHAPE_ID, type StoryLimits } from "../shapes/story";
import { bindStory } from "./bind";
import type { StoryBank, StoryChoice } from "./types";

function bindSide(side: SnapshotSide, bank: StoryBank, choice: StoryChoice): SnapshotSide {
  if (!side.rows.some((row) => row.shape.id === STORY_SHAPE_ID)) return side;
  return { ...side, rows: side.rows.map((row) => (row.shape.id === STORY_SHAPE_ID ? { ...row, limits: bindStory((row.limits as StoryLimits).ids, bank, choice) } : row)) };
}

export function bindSheet(sheet: SnapshotSheet, bank: StoryBank, choice: StoryChoice): SnapshotSheet {
  const [front, back] = [bindSide(sheet.front, bank, choice), bindSide(sheet.back, bank, choice)];
  return front === sheet.front && back === sheet.back ? sheet : { ...sheet, front, back };
}
