// Each digit of a stack stands in the column of its place, ones under ones, and each digit in a bracket under its place of
// the answer area above. The places of a stack are those of the question, from its right end, and those of a bracket start
// at the left end of the area. Where the digits stand is what the typesetter reports.
import { BRACKET_SIGN, PRINT_RULES, type BookItem, type BracketFace, type ColumnFace, type DrawnText, type PageModel, type Region } from "../contract";
import { faceBlanks } from "./face-print";
import { EPSILON, near, right } from "./rects";
import type { PlacedText, PlacedTexts } from "./texts";

const PLACES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands", "millions"];
const placeName = (place: number): string => `in the ${PLACES[place] ?? `place ${place + 1}`}`;
/** How far from the middle of its column a digit may stand, as a part of the width of a column. */
const ROOM = 0.02;

type Tell = (problem: string) => void;

/** The place that the middle of a drawn text stands in, counted from the right end, or null between two places. */
function placeOf({ start, end }: DrawnText, rightEnd: number, width: number): number | null {
  const at = (rightEnd - (start.x + end.x) / 2) / width - 0.5;
  const place = Math.round(at);
  return Math.abs(at - place) <= ROOM && place >= 0 ? place : null;
}

const isLevel = (line: readonly PlacedText[]): boolean => line.length > 0 && line.every((t) => near(t.drawn.start.y, line[0].drawn.start.y));
const isLine = (line: readonly PlacedText[], wanted: readonly string[]): boolean => isLevel(line) && line.map((t) => t.drawn.text).join("\n") === wanted.join("\n");

/** The texts of a line from left to right, the last one in the ones. */
function checkLine(line: readonly PlacedText[], rightEnd: number, width: number, name: string, tell: Tell): void {
  line.forEach(({ drawn }, i) => {
    const wanted = line.length - 1 - i;
    const place = placeOf(drawn, rightEnd, width);
    if (place !== wanted) tell(`must have "${drawn.text}" of ${name} ${placeName(wanted)}, and it stands ${place === null ? "between two places" : placeName(place)}`);
  });
}

function checkStack({ top, sign, bottom }: ColumnFace, texts: readonly PlacedText[], tell: Tell): void {
  const lines = [[...top], [sign, ...bottom]];
  const [first, second] = [texts.slice(0, lines[0].length), texts.slice(lines[0].length)];
  if (!isLine(first, lines[0]) || !isLine(second, lines[1]) || !(first[0].drawn.start.y < second[0].drawn.start.y)) return tell(`must have its ${lines.flat().length} digits and signs in 2 lines, with each line level`);
  const { region, ink: { rect: { w: width } } } = first[0];
  if (texts.some((t) => !near(t.ink.rect.w, width))) return tell("must have cells of one width");
  [first, second].forEach((line, l) => checkLine(line, right(region.rect), width, `its line ${l + 1}`, tell));
}

/**
 * The digits inside a bracket stand in the first places of the area above, which begins over the first one. The number
 * outside and the sign stand left of them. The sign is a larger letter, so it has a line of its own.
 */
function checkBracket(face: BracketFace, texts: readonly PlacedText[], area: Region | undefined, tell: Tell): void {
  const inside = texts.slice(texts.length - face.inside.length);
  const [outside, sign] = texts.slice(texts.length - face.inside.length - 2);
  const isWhole = isLine(inside, [...face.inside]) && outside?.drawn.text === face.outside && sign?.drawn.text === BRACKET_SIGN && isLevel([outside, ...inside]);
  if (!isWhole || !area) return tell(`must have "${face.outside}" and the ${face.inside.length} digits of "${face.inside}" in one line below its answer area`);
  const { cell: { w: width }, bracket } = PRINT_RULES;
  const left = area.rect.x;
  checkLine(inside, left + face.inside.length * width, width, "its number inside", tell);
  const [signStart, signEnd] = [left - bracket.sign, left];
  if (!(outside.drawn.end.x <= signStart + EPSILON && sign.drawn.start.x >= signStart - EPSILON && sign.drawn.end.x <= signEnd + EPSILON)) tell(`must have "${face.outside}", then "${BRACKET_SIGN}", left of its number inside`);
  if (!(inside[0].drawn.start.y - inside[0].drawn.natural.above >= area.rect.y + area.rect.h)) tell("must have its number inside below its answer area");
}

/** The answer area of the first blank of a question. */
const areaOf = (page: PageModel, { id, face }: BookItem): Region | undefined => page.regions.find((r) => r.role === "answer" && r.item === id && r.part === faceBlanks(face)?.[0]);

export function checkPlaces(pages: readonly PageModel[], items: readonly BookItem[], { texts }: PlacedTexts): string[] {
  const problems: string[] = [];
  const ofItem = new Map<string | null, PlacedText[]>();
  for (const placed of texts) {
    if (placed.region.role === "question") ofItem.set(placed.region.item, [...(ofItem.get(placed.region.item) ?? []), placed]);
  }
  const itemOf = new Map<string | null, BookItem>(items.map((i) => [i.id, i]));
  for (const page of pages) {
    for (const { role, item: id } of page.regions) {
      const item = role === "question" ? itemOf.get(id) : undefined;
      if (!item) continue;
      const tell: Tell = (problem) => problems.push(`Page ${page.page}: question ${item.number} ${problem}.`);
      const texts = ofItem.get(id) ?? [];
      if (item.face.kind === "column") checkStack(item.face, texts, tell);
      if (item.face.kind === "bracket") checkBracket(item.face, texts, areaOf(page, item), tell);
    }
  }
  return problems;
}
