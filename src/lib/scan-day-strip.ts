import type { DayPage, PageMarks, StackPhoto, StackTile } from "@/lib/scan-stack";

// The new scan screen's day strip (#915, round r915-scan-flow): the day the parent is on, one tile per printed page,
// each with a state that has its own glyph and words, never a colour alone. Pure: no clock but the one passed in.

/** Where one page of the day stands. */
export type StripState = "marked" | "marking" | "sent" | "ready" | "checking" | "saved" | "retake" | "todo";

export interface StripTile {
  pageId: string;
  pageNumber: number;
  /** The page's kind in plain words ("Practice"), or null. */
  name: string | null;
  state: StripState;
  /** The stack tile of this page's photo, to open its sheet; null for a page with no photo. */
  tileKey: string | null;
  photoId: string | null;
  marks: PageMarks | null;
  /** What a screen reader says for the tile: "Page 19, marked". */
  label: string;
}

export interface DayStrip {
  workbookId: string;
  day: string;
  tiles: StripTile[];
  /** Pages counted as done: marked when marking is on, else scanned (a photo that does not need retaking). */
  done: number;
  total: number;
  /** "5 of 8 pages marked". */
  countText: string;
  /** Every page of the day is done. */
  complete: boolean;
  /** The next day of the same book when this one is complete, or null. */
  nextDay: string | null;
  /** This is the last day of the book, and it is complete. */
  allDone: boolean;
}

const STATE_WORDS: Record<StripState, string> = {
  marked: "marked", marking: "marking", sent: "sent for marking", ready: "ready to send", checking: "checking",
  saved: "saved", retake: "needs another photo", todo: "still to scan",
};
export const stripWords = (state: StripState) => STATE_WORDS[state];

function stateOf(tile: StackTile | undefined, photo: StackPhoto | undefined, marking: boolean): StripState {
  if (!tile || !photo) return "todo";
  if (tile.status === "sent") return !marking ? "sent" : photo.marks?.complete ? "marked" : "marking";
  if (tile.status === "refused") return "retake";
  if (tile.status === "ready") return "ready";
  if (tile.status === "saved" || tile.status === "unavailable") return "saved";
  return "checking";
}

/**
 * The day to show: the day of the latest page, in book order, of the newest book that has a photo; with no photo yet,
 * the first day of the newest book. A day whose pages are all done stays in view, marked done, with the next day named.
 */
export function dayStrip(o: { photos: readonly StackPhoto[]; pages: readonly DayPage[]; tiles: readonly StackTile[]; marking: boolean }): DayStrip | null {
  if (!o.pages.length) return null;
  const order = new Map(o.pages.map((p, i) => [p.id, i]));
  const known = o.photos.filter((p) => order.has(p.pageId));
  const books = o.pages.map((p) => ({ id: p.workbookId, book: p.book }));
  const newestBook = (known.length ? known.map((p) => ({ id: p.workbookId, book: p.book })) : books).sort((a, b) => b.book - a.book)[0].id;
  const inBook = o.pages.filter((p) => p.workbookId === newestBook);
  const latest = known.filter((p) => p.workbookId === newestBook).sort((a, b) => order.get(b.pageId)! - order.get(a.pageId)!)[0];
  const anchor = latest ? o.pages[order.get(latest.pageId)!] : inBook[0];
  if (!anchor) return null;
  const tileOf = new Map(o.tiles.filter((t) => t.photoId).map((t) => [t.photoId!, t]));
  // The newest photo of each page speaks for it.
  const photoOf = new Map<string, StackPhoto>();
  for (const p of [...known].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) photoOf.set(p.pageId, p);
  const tiles = inBook.filter((p) => p.day === anchor.day).map((p): StripTile => {
    const photo = photoOf.get(p.id);
    const tile = photo ? tileOf.get(photo.id) : undefined;
    const state = stateOf(tile, photo, o.marking);
    return { pageId: p.id, pageNumber: p.pageNumber, name: p.name, state, tileKey: tile?.key ?? null, photoId: photo?.id ?? null, marks: photo?.marks ?? null, label: `Page ${p.pageNumber}, ${STATE_WORDS[state]}` };
  });
  const done = tiles.filter((t) => (o.marking ? t.state === "marked" : t.state !== "todo" && t.state !== "retake")).length;
  const complete = done === tiles.length;
  const days = [...new Set(inBook.map((p) => p.day))];
  const next = days[days.indexOf(anchor.day) + 1] ?? null;
  return {
    workbookId: newestBook, day: anchor.day, tiles, done, total: tiles.length,
    countText: `${done} of ${tiles.length} ${tiles.length === 1 ? "page" : "pages"} ${o.marking ? "marked" : "scanned"}`,
    complete, nextDay: complete ? next : null, allDone: complete && !next,
  };
}

/** A sent page's score: "7 of 8 · 1 to practise", "3 of 3", "2 so far · 1 being checked", or "Marking…". */
export function pageScore(marks: PageMarks | null | undefined): string {
  if (!marks || (!marks.scored && !marks.complete)) return "Marking…";
  const practise = marks.toPractise ? ` · ${marks.toPractise} to practise` : "";
  if (marks.complete) return `${marks.right} of ${marks.total}${practise}`;
  return `${marks.right} of ${marks.scored} so far · ${marks.waiting} being checked`;
}

/** The local calendar day of a time, in this browser. */
const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/**
 * The pages sent today, newest book order, and the day's score over the answers marked so far:
 * "Danyal got 17 of 19 right on today's pages". Null when nothing sent today has a mark yet.
 */
export function todaysPages(photos: readonly StackPhoto[], now: number): { pages: StackPhoto[]; right: number; scored: number; marking: number } {
  const today = localDay(new Date(now).toISOString());
  const pages = photos.filter((p) => p.sentAt && localDay(p.sentAt) === today).sort((a, b) => a.book - b.book || a.pageNumber - b.pageNumber);
  let right = 0, scored = 0, marking = 0;
  for (const p of pages) {
    if (p.marks) { right += p.marks.right; scored += p.marks.scored; }
    if (!p.marks?.complete) marking++;
  }
  return { pages, right, scored, marking };
}

export function scoreLine(name: string, today: { right: number; scored: number; marking: number }): string | null {
  if (!today.scored) return null;
  const still = today.marking ? ` · ${today.marking === 1 ? "1 page" : `${today.marking} pages`} still marking` : "";
  return `${name} got ${today.right} of ${today.scored} right on today's pages${still}`;
}

/** "3 pages need another photo". */
export const retakeLine = (n: number) => (n === 1 ? "1 page needs another photo" : `${n} pages need another photo`);
