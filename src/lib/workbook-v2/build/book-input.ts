// Reads what a book is made for: the child, the sheets and the QR text of each page. All of it comes from the caller;
// the engine makes no id, no token and no date of its own.
import { FieldReader } from "../bank/fields";
import type { Snapshot, SnapshotSheet } from "../bank/snapshot";
import type { Side } from "../contract";

/** `startsDay` says that the sheet is the first of a day of the book, so that its front page has the time log. */
export interface BookSheet { sheet: SnapshotSheet; attempt: number; qr: Record<Side, string>; startsDay: boolean }
export interface BookRequest { bookId: string; childId: string; sheets: BookSheet[] }

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

export function readBookRequest(raw: unknown, snapshot: Snapshot): BookRequest | string[] {
  const r = new FieldReader();
  const place = "The book";
  const fields = r.object(place, raw, ["bookId", "childId", "sheets"]);
  if (!fields) return r.problems;
  const { bookId, childId } = fields;
  for (const name of ["bookId", "childId"]) if (!isName(fields[name])) r.problem(place, `${name} must use only letters, digits and dashes`);
  const sheets = r.list(place, fields, "sheets").map((s, i) => readSheet(r, s, i, snapshot)).filter((s) => s !== null);
  r.unique("sheet and attempt", sheets.map((s) => `${s.sheet.id}, attempt ${s.attempt}`), place);
  // Two pages with one QR text would send the scan of one page to the answers of the other.
  r.unique("QR text", sheets.flatMap((s) => [s.qr.front, s.qr.back]), place);
  return r.problems.length === 0 && isName(bookId) && isName(childId) ? { bookId, childId, sheets } : r.problems;
}
