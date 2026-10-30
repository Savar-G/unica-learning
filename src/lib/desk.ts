import { isUuid, type PageImage, type QuestionBox, type WorkbookPage, type WorkbookStore, type WorkbookSummary } from "@/lib/workbook-content";

// The child's desk (#301, spec #295). The parent opens it from Parent home for one child on their own device; it shows
// only that child's shipped workbooks, newest first, with the real page image and a tap area on each question, and
// Maya's panel beside it. Leaving needs the parent's PIN (src/lib/parent-pin.ts).
//
// Desk mode is a convenience on the parent's device, not a security boundary against the parent's own session (spec
// #295). It is a cookie (DESK_COOKIE) that names the parent and the child. While it is set and that parent is signed in,
// the proxy (src/proxy.ts) sends every account page back to the desk and refuses the account APIs (deskGate). The PIN
// check (/api/desk/leave) or a PIN reset after the account password (/api/desk/forgot-pin) clears it.
//
// A page's QR code holds `<site>/tutor/p/<token>`. The token opens the desk at that page for the signed-in parent of the
// workbook's family, and is refused for anyone else (openPageToken).
//
// Reads go through the workbook store seam (src/lib/workbook-content.ts): with the parent's session, row-level security
// already gives only that family's shipped workbooks; this module checks the family and the status again, so the
// in-memory store in its tests behaves the same. Pure TypeScript: no Next.js, React, network, database or clock.

/** The desk's address. */
export const DESK_HOME = "/tutor";
/** The cookie that keeps a device in desk mode: `<parent id>.<child id>`. */
export const DESK_COOKIE = "unica_desk";

export interface DeskLock {
  parentId: string;
  childId: string;
}

export const lockCookie = (parentId: string, childId: string) => `${parentId}.${childId}`;

export function readLock(value: string | undefined): DeskLock | null {
  const [parentId, childId, ...rest] = (value ?? "").split(".");
  return isUuid(parentId) && isUuid(childId) && rest.length === 0 ? { parentId, childId } : null;
}

/**
 * What the proxy does with a request while a desk may be open. `pass`: let it through. `to-desk`: send the page back to
 * the desk. `refuse`: answer an API call with an error. Only a desk opened by the parent who is signed in counts.
 */
export function deskGate(pathname: string, cookie: string | undefined, sessionParent: string | null): "pass" | "to-desk" | "refuse" {
  const lock = readLock(cookie);
  if (!lock || !sessionParent || lock.parentId !== sessionParent) return "pass";
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  if (under(DESK_HOME) || under("/api/desk") || under("/auth")) return "pass";
  if (under("/api")) return "refuse";
  return "to-desk";
}

/** A question on the desk: its number, its box and its text. Never its answer, steps or wrong answers. */
export interface DeskQuestion {
  number: number;
  box: QuestionBox;
  /** The question as printed, or null when its stored content cannot be trusted. */
  text: string | null;
}

export interface DeskPage {
  number: number;
  dayLabel: string | null;
  type: string;
  image: PageImage | null;
  questions: DeskQuestion[];
}

export type DeskView =
  | { status: "no-workbook" }
  | {
      status: "ready";
      /** The child's shipped workbooks, newest first: the covers to switch between. */
      workbooks: WorkbookSummary[];
      workbook: WorkbookSummary;
      /** Every page number of the open workbook, in order. */
      pages: number[];
      page: DeskPage;
      /** `not-this-child`: the workbook asked for is not one of this child's shipped workbooks, so the newest opened. */
      notice: "not-this-child" | null;
    };

const deskPage = (p: WorkbookPage): DeskPage => ({
  number: p.number, dayLabel: p.dayLabel, type: p.type, image: p.image,
  questions: p.questions.map((q) => ({ number: q.number, box: q.box, text: q.content.status === "found" ? q.content.package.text : null })),
});

/**
 * The desk for one child: their shipped workbooks, the one asked for (else the newest), and the page asked for (else
 * the first page with questions, else the first page).
 */
export async function deskView(store: WorkbookStore, o: { parentId: string; childId: string; workbookId?: string; page?: number }): Promise<DeskView> {
  const workbooks = (await store.childWorkbooks(o.childId)).filter((w) => w.parentId === o.parentId && w.childId === o.childId && w.status === "shipped");
  if (workbooks.length === 0) return { status: "no-workbook" };
  const asked = o.workbookId === undefined ? undefined : workbooks.find((w) => w.id === o.workbookId);
  const summary = asked ?? workbooks[0];
  const book = await store.workbook(summary.id);
  if (!book || book.pages.length === 0) return { status: "no-workbook" };
  const page = book.pages.find((p) => p.number === o.page) ?? book.pages.find((p) => p.questions.length > 0) ?? book.pages[0];
  return {
    status: "ready",
    workbooks,
    workbook: summary,
    pages: book.pages.map((p) => p.number),
    page: deskPage(page),
    notice: o.workbookId !== undefined && !asked ? "not-this-child" : null,
  };
}

/** A question's tap area on the page image, in percent of the image's width and height (3 decimals). */
export interface TapArea {
  question: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

const percent = (part: number, whole: number) => Math.round((part / whole) * 100_000) / 1000;

export function tapAreas(page: DeskPage): TapArea[] {
  const image = page.image;
  if (!image) return [];
  return page.questions.map((q) => ({
    question: q.number,
    left: percent(q.box.x, image.width),
    top: percent(q.box.y, image.height),
    width: percent(q.box.width, image.width),
    height: percent(q.box.height, image.height),
  }));
}

/** What leaving the desk gets back, from src/app/api/desk/leave/route.ts. */
export type LeaveResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "not_set" | "unavailable" | "signed_out" | "bad_json" }
  | { ok: false; error: "wrong"; attemptsLeft: number }
  | { ok: false; error: "locked"; retryAt: number };

export type PageTokenResult = { status: "found"; childId: string; workbookId: string; page: number } | { status: "refused" };

/** A page QR code: the page, for the parent of the workbook's family once it is shipped; refused for anyone else. */
export async function openPageToken(store: WorkbookStore, parentId: string, token: string): Promise<PageTokenResult> {
  const found = await store.pageByToken(token);
  if (!found || found.workbook.parentId !== parentId || found.workbook.status !== "shipped") return { status: "refused" };
  return { status: "found", childId: found.workbook.childId, workbookId: found.workbook.id, page: found.page };
}
