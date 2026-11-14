// The Scan pages stack (spec #368, round r565, D-269 to D-276): what the parent sees between photos. Pure TypeScript,
// shared by the phone, the desktop view (D-273) and the list route: no React, network, clock or database.
//
// Each photo is one of: still being added (a local upload), being checked, ready, refused with a plain reason, saved with
// no check (a family without checks), not checkable (an old printing), or sent for marking. Send counts only ready pages
// (D-270); every other page stays in the stack. Pages group by day, in page order, and a page of a day with no photo is
// named ("No photo yet: page 2"). The reasons are the ones the server already returns: the upload's refusals and the
// calibration's refusals (S2b). No new reason is made up here.
import type { ScanRefusal } from "@/lib/scan-crops";

/** What the server's checks say about one saved photo. "none": this family has no checks (D-252). */
export type CheckState = "none" | "checking" | "ready" | "refused" | "unavailable";

/** Why the upload route refused a photo, as its error codes say, plus "unavailable" when the photo did not reach us. */
export type UploadRefusal = "qr" | "page" | "duplicate" | "image" | "size" | "frequency" | "quota" | "unavailable";

export type StackReason = ScanRefusal | UploadRefusal;

/** One active photo (pending or saved), as the list route gives it. */
export interface StackPhoto {
  id: string;
  pageId: string;
  workbookId: string;
  book: number;
  pageNumber: number;
  state: "pending" | "saved";
  check: CheckState;
  reason: ScanRefusal | null;
  sentAt: string | null;
  createdAt: string;
}

/** A photo the parent took or chose on this device that has no saved photo yet. */
export interface StackUpload {
  key: string;
  status: "waiting" | "uploading" | "refused";
  reason?: UploadRefusal;
  /** The server had no room for it for a while (#915): it keeps its place and asks again. */
  held?: boolean;
  /** The phone's early look found no page code (#915): a hint only, the server still reads it and decides. */
  codeUnread?: boolean;
}

/** A printed workbook page that belongs to a day. */
export interface DayPage {
  id: string;
  workbookId: string;
  book: number;
  pageNumber: number;
  day: string;
  pageOfDay: number;
  pagesInDay: number;
  /** What kind of page it is, in plain words ("Mixed review"); null when the stored type has no plain name (the parent-led pages of U1 to U3). */
  name: string | null;
}

/**
 * The plain name of each stored page type (`workbook_pages.page_type`). The printed title of a page is made when the book
 * is built and is not stored, so the scan screen names a page by its kind. A page type not listed here has no name.
 */
const PAGE_KIND_NAMES: Readonly<Record<string, string>> = {
  "warm-up": "Warm-up", "remember-these": "Review", "new-idea": "New idea", practice: "Practice", "practice-2": "Practice",
  "word-problems": "Word problems", "math-in-the-world": "Math in the world", "unit-b": "Practice",
  "remember-these-mixed-set": "Mixed review", "friday-5": "Friday 5", challenge: "Challenge",
  "show-what-you-know": "Show what you know", "level-test": "Level test",
};
export const pageKindName = (type: string | null | undefined): string | null => (type && Object.hasOwn(PAGE_KIND_NAMES, type) ? PAGE_KIND_NAMES[type] : null);

/** Where a page of the day stands for the parent. */
export type GuideStatus = "done" | "retake" | "todo";

export interface GuidePage {
  pageId: string;
  /** "Page 17 · Day 2, Mixed review" (no name when the page has none). */
  title: string;
  status: GuideStatus;
}

/** Which page to scan next, and where each page of that day stands. Guidance only: any page can be scanned in any order. */
export interface StackGuide {
  day: string;
  /** The first page of the day with no photo yet, or null when every page has one. */
  next: GuidePage | null;
  pages: GuidePage[];
  /**
   * How many pages of this day still lack a usable photo (not scanned, or needing another photo): "3 pages left in Day 2",
   * or "All pages of Day 2 are scanned". Only this day: earlier days the parent did not finish are not listed (#915).
   */
  stillText: string;
}

/** "adding": on its way to the server; "waiting": in the queue on this device, or waiting for room on the server. */
export type TileStatus = "adding" | "waiting" | "checking" | "ready" | "saved" | "refused" | "unavailable" | "sent";

export interface StackTile {
  key: string;
  photoId: string | null;
  uploadKey: string | null;
  /** "Page 17" in a day; "Page 17 · Day 4" outside one; "Unknown page" when the page is not known. */
  label: string;
  /** The page's full name wherever it shows: "Page 17 · Day 4", or "Unknown page". */
  title: string;
  status: TileStatus;
  /** The short reason under a refused or uncheckable tile. */
  reason: string | null;
  refusal: StackReason | null;
  /** A photo still sending whose code the phone could not read (#915): the server may ask for another photo. */
  hint?: "code";
}

export interface StackDay {
  key: string;
  label: string;
  tiles: StackTile[];
  /** Printed page numbers of the day with no photo yet. */
  missing: number[];
  missingText: string | null;
}

export interface Stack {
  refused: StackTile[];
  /** Photos still on their way to the server, sending or waiting: their page is not known yet. */
  adding: number;
  /** Of those, how many are waiting their turn, and how many of those the server had no room for (#915). */
  waiting: number;
  held: number;
  addingTiles: StackTile[];
  days: StackDay[];
  sent: StackTile[];
  readyIds: string[];
  counts: { photos: number; ready: number; refused: number; checking: number };
  /** The one tile of a stack of one, shown large (D-269). */
  one: StackTile | null;
  /** The day the parent is scanning (the one with the newest unsent photo): its next page and every page's standing. */
  guide: StackGuide | null;
}

/** Each page with a day, numbered within its day in book order. Pages with no day (a cover, the answers) are left out. */
export function dayPages(pages: readonly { id: string; workbookId: string; book: number; pageNumber: number; day: string | null; type?: string | null }[]): DayPage[] {
  const byDay = new Map<string, typeof pages[number][]>();
  for (const p of pages) {
    if (!p.day) continue;
    const key = `${p.workbookId}|${p.day}`;
    byDay.set(key, [...(byDay.get(key) ?? []), p]);
  }
  const out: DayPage[] = [];
  for (const group of byDay.values()) {
    const sorted = [...group].sort((a, b) => a.pageNumber - b.pageNumber);
    sorted.forEach((p, i) => out.push({ id: p.id, workbookId: p.workbookId, book: p.book, pageNumber: p.pageNumber, day: p.day!, pageOfDay: i + 1, pagesInDay: sorted.length, name: pageKindName(p.type) }));
  }
  return out.sort((a, b) => a.book - b.book || a.pageNumber - b.pageNumber);
}

const REFUSALS: Record<StackReason, { short: string; title: string; action: string }> = {
  "marks-missing": { short: "Cut off", title: "Part of the page is cut off.", action: "Keep all four corner marks and the small code in the bottom-left corner in the photo. Then take another photo." },
  "marks-inconsistent": { short: "Not flat", title: "The page is bent or not flat in this photo.", action: "Lay the page flat on a table and hold the phone straight above it. Then take another photo." },
  "page-mismatch": { short: "Wrong page", title: "The page in this photo does not match its code.", action: "Take a photo of one page on its own, with its own code in the bottom-left corner in view. Then take another photo." },
  "orientation-unclear": { short: "Turned", title: "We cannot tell which way up this page is.", action: "Hold the page upright. Then take another photo." },
  "ambiguous-page": { short: "More than one page", title: "We cannot tell which page this photo is of.", action: "Fold the book back or take the page out, so only one page shows and fills the photo." },
  "qr-mismatch": { short: "Code not read", title: "We cannot read the small code in the bottom-left corner.", action: "Hold the phone steady and keep that corner in view, with no glare or shadow on the code. Then take another photo." },
  "another-page": { short: "Another page", title: "Part of this photo looks like a different page.", action: "Take a photo of this page on its own, flat, with nothing on top of it." },
  faint: { short: "Hard to read", title: "Part of the page is too bright, faint or covered to read.", action: "Use even light without the flash, and keep fingers and objects off the page. Then take another photo." },
  "check-timeout": { short: "Not checked yet", title: "We couldn't check this page right now.", action: "Try again in a minute." },
  "printed-page-changed": { short: "Cannot check", title: "We cannot line up this photo with the printed page.", action: "Take another photo of the whole page, flat and in good light." },
  failed: { short: "Cannot check", title: "We cannot line up this photo with the printed page.", action: "Take another photo of the whole page, flat and in good light." },
  qr: { short: "Code not read", title: "We cannot read the small code in the bottom-left corner.", action: "Hold the phone steady and keep that corner in view, with no glare, shadow or finger on the code. Then take another photo." },
  page: { short: "Wrong workbook", title: "This page is not in this child's workbook.", action: "Check the child, then take a photo of a page from this workbook." },
  duplicate: { short: "Already has a photo", title: "This page already has a photo.", action: "Open its photo in the stack. Delete it first if you need another photo." },
  image: { short: "Cannot open", title: "We cannot open this photo.", action: "Choose a JPG, PNG or WebP photo of one page." },
  size: { short: "Too large", title: "This photo is too large.", action: "Choose a photo smaller than 20 MB." },
  frequency: { short: "Too many photos", title: "You have sent many photos in a short time.", action: "Wait a few minutes. Then try again." },
  quota: { short: "Storage full", title: "Your family's photo storage is full.", action: "Delete older photos. Then try again." },
  unavailable: { short: "Not sent", title: "We could not send this photo.", action: "Check your connection. Then try again." },
};

/** The short reason, the plain title and what to do, for any refusal. */
export const refusalCopy = (reason: StackReason) => REFUSALS[reason] ?? REFUSALS.failed;

/** "2", "2 and 4", "2, 4 and 5". */
const listed = (n: readonly number[]) => (n.length < 2 ? `${n[0]}` : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`);

type Built = { photo: StackPhoto; tile: StackTile }[];

/**
 * The guide for the latest day, in book order, that has a photo not yet sent (a retake of an earlier page never moves
 * it back): a page with a photo is done unless refused (retake); the rest are to do.
 */
function guideOf(o: { photos: readonly StackPhoto[]; pages: readonly DayPage[] }, tiles: Built, dayLabel: (p: DayPage) => string, pageLabel: (p: DayPage) => string): StackGuide | null {
  const pageById = new Map(o.pages.map((p) => [p.id, p]));
  const order = new Map(o.pages.map((p, i) => [p.id, i]));
  const open = tiles.filter((t) => t.tile.status !== "sent" && pageById.has(t.photo.pageId));
  // The workbook of the newest photo; within it, the latest page in book order.
  const book = [...open].sort((a, b) => b.photo.createdAt.localeCompare(a.photo.createdAt))[0]?.photo.workbookId;
  const current = open.filter((t) => t.photo.workbookId === book).sort((a, b) => order.get(b.photo.pageId)! - order.get(a.photo.pageId)!)[0];
  const anchor = current && pageById.get(current.photo.pageId);
  if (!anchor) return null;
  const standing = new Map(tiles.map((t) => [t.photo.pageId, t.tile.status === "refused" ? "retake" as const : "done" as const]));
  const pages = o.pages.filter((p) => p.workbookId === anchor.workbookId && p.day === anchor.day).map((p): GuidePage => {
    const where = pageLabel(p);
    return { pageId: p.id, title: p.name ? `${where}, ${p.name}` : where, status: standing.get(p.id) ?? "todo" };
  });
  const left = pages.filter((p) => p.status !== "done").length;
  const day = dayLabel(anchor);
  const stillText = left ? `${left === 1 ? "1 page" : `${left} pages`} left in ${day}.` : `All pages of ${day} are scanned.`;
  return { day, stillText, next: pages.find((p) => p.status === "todo") ?? null, pages };
}

export function buildStack(o: { photos: readonly StackPhoto[]; uploads: readonly StackUpload[]; pages: readonly DayPage[]; checks: boolean }): Stack {
  const pageById = new Map(o.pages.map((p) => [p.id, p]));
  const books = new Set(o.photos.map((p) => p.workbookId));
  const dayLabel = (p: DayPage) => (books.size > 1 ? `Workbook ${p.book} · ${p.day}` : p.day);
  /** The printed number first, as at the foot of the sheet, then the day: "Page 17 · Day 2". */
  const pageLabel = (p: DayPage) => `Page ${p.pageNumber} · ${dayLabel(p)}`;
  const fullLabel = (photo: StackPhoto) => {
    const page = pageById.get(photo.pageId);
    return page ? pageLabel(page) : `Page ${photo.pageNumber}`;
  };

  const tileOf = (photo: StackPhoto): StackTile => {
    const page = pageById.get(photo.pageId);
    const base = { key: photo.id, photoId: photo.id, uploadKey: null, label: page ? `Page ${page.pageNumber}` : fullLabel(photo), title: fullLabel(photo), reason: null, refusal: null };
    if (photo.sentAt && photo.state === "saved" && o.checks && photo.check === "ready") return { ...base, label: fullLabel(photo), status: "sent" };
    if (photo.state === "pending") return { ...base, status: "checking" };
    if (!o.checks || photo.check === "none") return { ...base, status: "saved" };
    if (photo.check === "refused") {
      const reason = photo.reason ?? "failed";
      return { ...base, label: fullLabel(photo), status: "refused", reason: refusalCopy(reason).short, refusal: reason };
    }
    if (photo.check === "unavailable") return { ...base, status: "unavailable", reason: "Cannot be checked" };
    return { ...base, status: photo.check === "ready" ? "ready" : "checking" };
  };

  const ordered = [...o.photos].sort((a, b) => a.book - b.book || a.pageNumber - b.pageNumber);
  const tiles = ordered.map((photo) => ({ photo, tile: tileOf(photo) }));

  const refusedUploads: StackTile[] = o.uploads.filter((u) => u.status === "refused").map((u) => {
    const reason = u.reason ?? "unavailable";
    return { key: u.key, photoId: null, uploadKey: u.key, label: "Unknown page", title: "Unknown page", status: "refused", reason: refusalCopy(reason).short, refusal: reason };
  });
  const addingTiles: StackTile[] = o.uploads.filter((u) => u.status !== "refused")
    .map((u) => ({ key: u.key, photoId: null, uploadKey: u.key, label: "New photo", title: "New photo", status: u.status === "uploading" && !u.held ? "adding" : "waiting",
      reason: u.held ? "Waiting for room" : u.codeUnread ? "Code may not read" : null, refusal: null, ...(u.codeUnread ? { hint: "code" as const } : {}) }));

  // Refused photos, oldest first, then refused uploads, whose page is not known.
  const refused = [
    ...tiles.filter((t) => t.tile.status === "refused").sort((a, b) => a.photo.createdAt.localeCompare(b.photo.createdAt)).map((t) => t.tile),
    ...refusedUploads,
  ];

  // Every page with an active photo (any status) is not a gap.
  const photographed = new Set(o.photos.map((p) => p.pageId));
  const days: StackDay[] = [];
  const dayOf = new Map<string, StackDay>();
  for (const { photo, tile } of tiles) {
    if (tile.status === "refused" || tile.status === "sent") continue;
    const page = pageById.get(photo.pageId);
    const key = page ? `${page.workbookId}|${page.day}` : `${photo.workbookId}|none`;
    let day = dayOf.get(key);
    if (!day) {
      const missing = page ? o.pages.filter((p) => p.workbookId === page.workbookId && p.day === page.day && !photographed.has(p.id)).map((p) => p.pageNumber) : [];
      day = { key, label: page ? dayLabel(page) : `Workbook ${photo.book}`, tiles: [], missing, missingText: missing.length ? `No photo yet: page${missing.length > 1 ? "s" : ""} ${listed(missing)}` : null };
      dayOf.set(key, day);
      days.push(day);
    }
    day.tiles.push(tile);
  }

  const sent = tiles.filter((t) => t.tile.status === "sent").map((t) => t.tile);
  const ready = tiles.filter((t) => t.tile.status === "ready");
  const checking = addingTiles.length + tiles.filter((t) => t.tile.status === "checking").length;
  const open = [...refused, ...addingTiles, ...days.flatMap((d) => d.tiles)];
  return {
    refused, adding: addingTiles.length, addingTiles, days, sent,
    waiting: addingTiles.filter((t) => t.status === "waiting").length,
    held: o.uploads.filter((u) => u.status !== "refused" && u.held).length,
    readyIds: ready.map((t) => t.photo.id),
    // The photos of this batch: a photo already sent for marking is not counted again (#915).
    counts: { photos: o.photos.length - sent.length + o.uploads.length, ready: ready.length, refused: refused.length, checking },
    // A refused page keeps its card and its retake, even alone.
    guide: guideOf(o, tiles, dayLabel, pageLabel),
    one: open.length === 1 && open[0].photoId && open[0].status !== "refused" ? open[0] : null,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "13 photos. 8 pages are ready to send." Without checks: "2 photos saved." */
export function stackSummary(stack: Stack, checks: boolean): string {
  // Right after Send: the sent pages have their own note; "0 photos" would read as if they were lost.
  if (!stack.counts.photos && stack.sent.length) return "";
  const photos = plural(stack.counts.photos, "photo", "photos");
  if (!checks) return `${photos} saved.`;
  const ready = stack.counts.ready;
  if (!ready) return `${photos}. No pages are ready to send yet.`;
  return `${photos}. ${ready === 1 ? "1 page is" : `${ready} pages are`} ready to send.`;
}

/** The Send button counts ready pages only (D-270). */
export function sendLabel(ready: number): string {
  if (ready === 1) return "Send this page for marking";
  if (ready === 0) return "Send pages for marking";
  return `Send ${ready} pages for marking`;
}

/** "Sending 2 photos", "Sending 2 photos, 5 waiting", "3 photos waiting": the count beside the new photos. */
export function addingCount(stack: Stack): string {
  const sending = stack.adding - stack.waiting;
  if (!sending) return `${plural(stack.waiting, "photo", "photos")} waiting`;
  return `Sending ${plural(sending, "photo", "photos")}${stack.waiting ? `, ${stack.waiting} waiting` : ""}`;
}

/**
 * What to do when the server has had no room for new photos for a while (#915), or null. The photos keep their place and
 * go on their own when there is room. Sending ready pages frees room, so it is named when there are ready pages to send.
 */
export function roomNote(stack: Stack): string | null {
  if (!stack.held) return null;
  const keep = stack.held === 1 ? "The waiting photo keeps its place" : "The waiting photos keep their place";
  if (stack.counts.ready) return `There is no room for more photos yet. Send these pages for marking first, then add more. ${keep}.`;
  return `There is no room for more photos yet. ${keep} and ${stack.held === 1 ? "goes" : "go"} when there is room.`;
}

/** The line above Send while some pages are still being checked; null when none are. */
export function waitingNote(stack: Stack): string | null {
  const n = stack.counts.checking;
  if (!n) return null;
  return `${n === 1 ? "1 page is" : `${n} pages are`} still being checked. ${n === 1 ? "It stays" : "They stay"} here.`;
}
