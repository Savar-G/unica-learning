// Reads what a book is made for: the child, the sheets and the QR text of each page. All of it comes from the caller;
// the engine makes no id, no token and no date of its own.
import { FieldReader } from "../bank/fields";
import type { Snapshot, SnapshotSheet } from "../bank/snapshot";
import type { Side } from "../contract";
import { interestsOf } from "../themes/bind";
import { DEFAULT_INTEREST, type StoryChoice } from "../themes/types";
import { readHistory, type BookHistory } from "./book-history";

/** `startsDay` says that the sheet is the first of a day of the book, so that its front page has the time log. */
export interface BookSheet { sheet: SnapshotSheet; attempt: number; qr: Record<Side, string>; startsDay: boolean }
/**
 * `stories` is the theme and the region of the word problems, or null for a snapshot with none. `history` is what the child
 * met in earlier books, or null when the request has none.
 */
export interface BookRequest { bookId: string; childId: string; sheets: BookSheet[]; stories: StoryChoice | null; history: BookHistory | null }

const isName = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9-]{1,64}$/.test(value);
const isQrText = (value: unknown): value is string => typeof value === "string" && /^[!-~]+$/.test(value);

function readSheet(r: FieldReader, raw: unknown, index: number, snapshot: Snapshot): BookSheet | null {
  const place = `The book, sheet ${index + 1}`;
  const fields = r.object(place, raw, ["sheetId", "attempt", "qr"], ["startsDay"]);
  if (!fields) return null;
  const startsDay = Object.hasOwn(fields, "startsDay") ? fields.startsDay : false;
  if (typeof startsDay !== "boolean") r.problem(place, "startsDay must be true or false");
  const sheet = typeof fields.sheetId === "string" ? snapshot.sheets.get(fields.sheetId) : undefined;
  if (!sheet) r.problem(place, `the snapshot has no sheet ${JSON.stringify(fields.sheetId)}`);
  const attempt = r.count(place, fields, "attempt");
  const qr = r.object(`${place}, qr`, fields.qr, ["front", "back"]);
  if (!qr) return null;
  for (const side of ["front", "back"]) if (!isQrText(qr[side])) r.problem(place, `the QR text of the ${side} must be printable text with no space`);
  const { front, back } = qr;
  return sheet && attempt !== null && isQrText(front) && isQrText(back) && typeof startsDay === "boolean" ? { sheet, attempt, qr: { front, back }, startsDay } : null;
}

/**
 * The region and the theme of the word problems: the default region of the snapshot and the default interest when the book
 * says none. An unknown one stops the book, and so does one for a snapshot with no word problems.
 */
function readStoryChoice(r: FieldReader, fields: Record<string, unknown>, { stories }: Snapshot): StoryChoice | null {
  const [hasRegion, hasScenario] = [Object.hasOwn(fields, "region"), Object.hasOwn(fields, "scenario")];
  if (!stories) {
    if (hasRegion || hasScenario) r.problem("The book", "the snapshot has no word problems, so the book has no region or scenario");
    return null;
  }
  const choice = { region: hasRegion ? fields.region : stories.defaultRegion, interest: hasScenario ? fields.scenario : DEFAULT_INTEREST };
  if (typeof choice.region !== "string" || !stories.packs.has(choice.region)) r.problem("The book", `the snapshot has no region pack ${JSON.stringify(choice.region)}`);
  if (typeof choice.interest !== "string" || !interestsOf(stories).includes(choice.interest)) r.problem("The book", `the snapshot has no scenario of the interest ${JSON.stringify(choice.interest)}`);
  return typeof choice.region === "string" && typeof choice.interest === "string" ? { region: choice.region, interest: choice.interest } : null;
}

export function readBookRequest(raw: unknown, snapshot: Snapshot): BookRequest | string[] {
  const r = new FieldReader();
  const place = "The book";
  const fields = r.object(place, raw, ["bookId", "childId", "sheets"], ["region", "scenario", "history"]);
  if (!fields) return r.problems;
  const history = Object.hasOwn(fields, "history") ? readHistory(r, fields.history) : null;
  const stories = readStoryChoice(r, fields, snapshot);
  const { bookId, childId } = fields;
  for (const name of ["bookId", "childId"]) if (!isName(fields[name])) r.problem(place, `${name} must use only letters, digits and dashes`);
  const sheets = r.list(place, fields, "sheets").map((s, i) => readSheet(r, s, i, snapshot)).filter((s) => s !== null);
  r.unique("sheet and attempt", sheets.map((s) => `${s.sheet.id}, attempt ${s.attempt}`), place);
  // Two pages with one QR text would send the scan of one page to the answers of the other.
  r.unique("QR text", sheets.flatMap((s) => [s.qr.front, s.qr.back]), place);
  return r.problems.length === 0 && isName(bookId) && isName(childId) ? { bookId, childId, sheets, stories, history } : r.problems;
}
