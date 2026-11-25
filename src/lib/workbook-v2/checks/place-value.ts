// Each digit of a stack stands in the column of its place: ones under ones. The places are those of the question, from its
// right end; where the digits stand is what the typesetter reports.
import type { BookItem, ColumnFace, DrawnText, PageModel } from "../contract";
import { near, right } from "./rects";
import { placeTexts, type PlacedText } from "./texts";

const PLACES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands", "millions"];
const placeName = (place: number): string => `in the ${PLACES[place] ?? `place ${place + 1}`}`;
/** How far from the middle of its column a digit may stand, as a part of the width of a column. */
const ROOM = 0.02;

/** The place that the middle of a drawn text stands in, counted from the right end, or null between two places. */
function placeOf({ start, end }: DrawnText, rightEnd: number, width: number): number | null {
  const at = (rightEnd - (start.x + end.x) / 2) / width - 0.5;
  const place = Math.round(at);
  return Math.abs(at - place) <= ROOM && place >= 0 ? place : null;
}

function checkStack({ top, sign, bottom }: ColumnFace, texts: readonly PlacedText[], tell: (problem: string) => void): void {
  const lines = [[...top], [sign, ...bottom]];
  const [first, second] = [texts.slice(0, lines[0].length), texts.slice(lines[0].length)];
  const isLevel = (line: readonly PlacedText[]) => line.length > 0 && line.every((t) => near(t.drawn.start.y, line[0].drawn.start.y));
  const isLine = (line: readonly PlacedText[], wanted: readonly string[]) => isLevel(line) && line.map((t) => t.drawn.text).join("\n") === wanted.join("\n");
  if (!isLine(first, lines[0]) || !isLine(second, lines[1]) || !(first[0].drawn.start.y < second[0].drawn.start.y)) return tell(`must have its ${lines.flat().length} digits and signs in 2 lines, with each line level`);
  const { region, ink: { rect: { w: width } } } = first[0];
  if (texts.some((t) => !near(t.ink.rect.w, width))) return tell("must have cells of one width");
  [first, second].forEach((line, l) => line.forEach(({ drawn }, i) => {
    const wanted = line.length - 1 - i;
    const place = placeOf(drawn, right(region.rect), width);
    if (place !== wanted) tell(`must have "${drawn.text}" of its line ${l + 1} ${placeName(wanted)}, and it stands ${place === null ? "between two places" : placeName(place)}`);
  }));
}

export function checkPlaces(pages: readonly PageModel[], items: readonly BookItem[], drawn: readonly DrawnText[]): string[] {
  const problems: string[] = [];
  const ofItem = new Map<string | null, PlacedText[]>();
  for (const placed of placeTexts(pages, drawn).texts) {
    if (placed.region.role === "question") ofItem.set(placed.region.item, [...(ofItem.get(placed.region.item) ?? []), placed]);
  }
  const itemOf = new Map<string | null, BookItem>(items.map((i) => [i.id, i]));
  for (const page of pages) {
    for (const { role, item: id } of page.regions) {
      const item = role === "question" ? itemOf.get(id) : undefined;
      if (item?.face.kind === "column") checkStack(item.face, ofItem.get(id) ?? [], (problem) => problems.push(`Page ${page.page}: question ${item.number} ${problem}.`));
    }
  }
  return problems;
}
