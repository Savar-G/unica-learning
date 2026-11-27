// The sheets of a snapshot for one book: each story row bound to the theme and the region of the book. Other rows stay as
// they are, so a sheet with no word problem is the same object.
import type { SnapshotSheet, SnapshotSide } from "../bank/snapshot";
import { STORY_SHAPE_ID, type StoryLimits } from "../shapes/story";
import { bindStory } from "./bind";
import type { StoryBank, StoryChoice } from "./types";

function bindSide(side: SnapshotSide, bank: StoryBank, choice: StoryChoice, seen: readonly string[]): SnapshotSide {
  if (!side.rows.some((row) => row.shape.id === STORY_SHAPE_ID)) return side;
  return { ...side, rows: side.rows.map((row) => (row.shape.id === STORY_SHAPE_ID ? { ...row, limits: bindStory((row.limits as StoryLimits).ids, bank, choice, seen) } : row)) };
}

/** `seen` holds the phrasings that the child has read, each as `<question>/<phrasing>`: the choice takes another one while there is one. */
export function bindSheet(sheet: SnapshotSheet, bank: StoryBank, choice: StoryChoice, seen: readonly string[] = []): SnapshotSheet {
  const [front, back] = [bindSide(sheet.front, bank, choice, seen), bindSide(sheet.back, bank, choice, seen)];
  return front === sheet.front && back === sheet.back ? sheet : { ...sheet, front, back };
}
