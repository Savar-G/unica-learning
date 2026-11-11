import { confirmedWorkbookDelivery } from "@/lib/workbook-delivery-access";
import type { DeliveryStore } from "@/lib/workbook-delivery";
import { hasOperation } from "@/lib/question-package";
import { operationText } from "@/lib/question-package-math";
import { isUuid, type PageImage, type QuestionBox, type WorkbookPage, type WorkbookStore, type WorkbookSummary } from "@/lib/workbook-content";

// The child's desk (#301, spec #295). The parent opens it from Parent home for one child on their own device; it shows
// only that child's shipped workbooks, newest first, with the real page image and a tap area on each question, and
// Maya's panel beside it. Leaving needs the parent's PIN (src/lib/parent-pin.ts).
//
// Desk mode is a convenience on the parent's device, not a security boundary against the parent's own session (spec
// #295). It is a cookie (DESK_COOKIE) that names the parent and the child. While it is set and that parent is signed in,
// the proxy (src/proxy.ts) sends every account page back to the desk and refuses the account APIs (deskAccess and
// DESK_GATE below). The PIN check (/api/desk/leave) or a PIN reset after the account password (/api/desk/forgot-pin)
// clears it.
//
// A page's QR code holds `<site>/tutor/p/<token>`. The token opens the desk at that page for the signed-in parent of the
// workbook's family, and is refused for anyone else (openPageToken).
//
// Reads go through the workbook store seam (src/lib/workbook-content.ts): with the parent's session, row-level security
// gives only that family's shipped books, with question packages after confirmed delivery. This module checks identity,
// status and the effective receipt again, so the
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

/** The names in a desk cookie, or null. Only the cookie's form: whether it opens the desk is `deskAccess`. */
export function readLock(value: string | undefined): DeskLock | null {
  const [parentId, childId, ...rest] = (value ?? "").split(".");
  return isUuid(parentId) && isUuid(childId) && rest.length === 0 ? { parentId, childId } : null;
}

/**
 * The desk on this device, as one request sees it. Every check of "is the desk open" starts here.
 * - `closed`: no desk cookie, or one that does not read.
 * - `open`: the desk is open for the parent who is signed in. Only this state holds the account.
 * - `latent`: a desk cookie of another parent, or nobody signed in. It opens nothing; it waits until its own parent signs
 *   in again (a shared device).
 * - `session_unknown`: a desk cookie, and the session could not be read (an Auth error, not a signed-out visitor). It
 *   holds the account, but lets sign-in through, because a signed-out device must be able to sign in again.
 */
export const DESK_ACCESS_STATES = ["closed", "open", "latent", "session_unknown"] as const;
export type DeskAccessState = (typeof DESK_ACCESS_STATES)[number];
export type DeskAccess = { state: "closed" } | { state: Exclude<DeskAccessState, "closed">; lock: DeskLock };

export function deskAccess(cookie: string | undefined, sessionParent: string | null, sessionKnown = true): DeskAccess {
  const lock = readLock(cookie);
  if (!lock) return { state: "closed" };
  if (!sessionKnown) return { state: "session_unknown", lock };
  return { state: sessionParent !== null && lock.parentId === sessionParent ? "open" : "latent", lock };
}

/** Which part of the site a path is, for the desk: the desk itself, sign-in, an API, or a page. */
export type DeskArea = "desk" | "sign_in" | "api" | "page";

export function deskArea(pathname: string): DeskArea {
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  if (under(DESK_HOME) || under("/api/desk") || under("/auth")) return "desk";
  if (under("/sign-in") || under("/start")) return "sign_in";
  if (under("/api")) return "api";
  return "page";
}

/**
 * What the proxy does with a request while a desk may be open. `pass`: let it through. `to-desk`: send the page back to
 * the desk. `refuse`: answer an API call with an error.
 */
export type DeskGate = "pass" | "to-desk" | "refuse";

/** The whole rule, one row per state of the desk: a new state fails the build until it has a row. */
export const DESK_GATE: { readonly [S in DeskAccessState]: { readonly [A in DeskArea]: DeskGate } } = {
  closed: { desk: "pass", sign_in: "pass", api: "pass", page: "pass" },
  latent: { desk: "pass", sign_in: "pass", api: "pass", page: "pass" },
  open: { desk: "pass", sign_in: "to-desk", api: "refuse", page: "to-desk" },
  session_unknown: { desk: "pass", sign_in: "pass", api: "refuse", page: "to-desk" },
};

/** The gate for one request: `DESK_GATE` for this desk and this path. */
export function deskGate(pathname: string, cookie: string | undefined, sessionParent: string | null, sessionKnown = true): DeskGate {
  return DESK_GATE[deskAccess(cookie, sessionParent, sessionKnown).state][deskArea(pathname)];
}

/** A question that the board writes in columns: two whole numbers and the operation between them. */
export interface ColumnsQuestion {
  kind: "add" | "subtract" | "multiply";
  operands: [number, number];
}

/** A question on the desk: its number, its box and its text. Never its answer, steps or wrong answers. */
export interface DeskQuestion {
  number: number;
  box: QuestionBox;
  /** The question as printed, or null when its stored content cannot be trusted. */
  text: string | null;
  /** The question for the board in columns, or null when it is not two whole numbers added, taken away or multiplied. */
  columns: ColumnsQuestion | null;
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
  | { status: "awaiting-delivery" }
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
      /** The question asked for, when it is on this page; else null. */
      picked: number | null;
    };

const wholeNumber = (n: number) => Number.isSafeInteger(n) && n >= 0;
const bare = (s: string) => s.replace(/\s+/g, "");

/**
 * The question for the board, only when the page prints it as the bare sum ("27 + 39 = ?"): a question in words leaves
 * the method to the child, so the board never shows it first.
 */
function columnsOf(q: WorkbookPage["questions"][number]): ColumnsQuestion | null {
  if (q.content.status !== "found" || !hasOperation(q.content.package)) return null;
  const { text, operation } = q.content.package;
  const { kind, operands } = operation;
  if (kind !== "add" && kind !== "subtract" && kind !== "multiply") return null;
  if (bare(text).replace(/=\?$/, "") !== bare(operationText(operation))) return null;
  const [a, b] = operands;
  return wholeNumber(a) && wholeNumber(b) ? { kind, operands: [a, b] } : null;
}

const deskPage = (p: WorkbookPage): DeskPage => ({
  number: p.number, dayLabel: p.dayLabel, type: p.type, image: p.image,
  questions: p.questions.map((q) => ({
    number: q.number, box: q.box, text: q.content.status === "found" ? q.content.package.text : null, columns: columnsOf(q),
  })),
});

/**
 * The desk for one child: their shipped workbooks, the one asked for (else the newest with a confirmed delivery), and the
 * page asked for (else the first page with questions, else the first page). Only that one page is read. Without
 * confirmed delivery of the workbook shown, no package is read: a workbook asked for that is not delivered, or no
 * delivered workbook at all, answers `awaiting-delivery`.
 */
export async function deskView(
  store: WorkbookStore,
  o: { parentId: string; childId: string; workbookId?: string; page?: number; question?: number },
  delivery: Pick<DeliveryStore, "receipt">,
  now: number,
): Promise<DeskView> {
  const workbooks = (await store.childWorkbooks(o.childId)).filter((w) => w.parentId === o.parentId && w.childId === o.childId && w.status === "shipped");
  if (workbooks.length === 0) return { status: "no-workbook" };
  const asked = o.workbookId === undefined ? undefined : workbooks.find((w) => w.id === o.workbookId);
  const delivered = async (w: WorkbookSummary) => {
    const receipt = await delivery.receipt(w.id);
    return !!receipt && receipt.parentId === o.parentId && receipt.childId === o.childId
      && receipt.workbookId === w.id && receipt.number === w.number
      && confirmedWorkbookDelivery([receipt], [], o.childId, w.id, now) !== null;
  };
  // A workbook asked for opens only when it is delivered. Else the newest delivered one: a shipped workbook still on its
  // way must not hide the one the child works in.
  let summary: WorkbookSummary | undefined;
  if (asked) summary = await delivered(asked) ? asked : undefined;
  else for (const w of workbooks) if (await delivered(w)) { summary = w; break; }
  if (!summary) return { status: "awaiting-delivery" };
  const index = await store.pageIndex(summary.id);
  const shown = index.find((p) => p.number === o.page) ?? index.find((p) => p.questions > 0) ?? index[0];
  const page = shown ? await store.page(summary.id, shown.number) : null;
  // A retraction during the package read must not show a page with no tappable questions.
  if (!await delivered(summary)) return { status: "awaiting-delivery" };
  if (!page) return { status: "no-workbook" };
  return {
    status: "ready",
    workbooks,
    workbook: summary,
    pages: index.map((p) => p.number),
    page: deskPage(page),
    notice: o.workbookId !== undefined && !asked ? "not-this-child" : null,
    picked: page.questions.some((q) => q.number === o.question) ? (o.question ?? null) : null,
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

/**
 * The question card (D-184): the part of the page image around one question, as a crop. `box` is the crop in image
 * pixels: the question's box with up to `margin` pixels around it, kept inside the image and out of every other question's box. The image is shown `imageWidth`
 * percent of the crop's width, moved `left` percent of the crop's width and `top` percent of its height (3 decimals).
 */
export interface QuestionCrop {
  question: number;
  box: QuestionBox;
  imageWidth: number;
  left: number;
  top: number;
}

const overlaps = (a: QuestionBox, b: QuestionBox) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export function questionCrop(page: DeskPage, question: number, margin = 16): QuestionCrop | null {
  const q = page.questions.find((x) => x.number === question);
  const image = page.image;
  if (!q || !image) return null;
  let left = Math.max(0, q.box.x - margin);
  let top = Math.max(0, q.box.y - margin);
  let right = Math.min(image.width, q.box.x + q.box.width + margin);
  let bottom = Math.min(image.height, q.box.y + q.box.height + margin);
  // The margin never reaches into another question (review R349-6): each side stops at a neighbour's box.
  for (const other of page.questions) {
    if (other === q) continue;
    const o = other.box;
    const oRight = o.x + o.width;
    const oBottom = o.y + o.height;
    if (o.x >= right || oRight <= left || o.y >= bottom || oBottom <= top) continue;
    if (oRight <= q.box.x) left = Math.max(left, oRight);
    else if (o.x >= q.box.x + q.box.width) right = Math.min(right, o.x);
    else if (oBottom <= q.box.y) top = Math.max(top, oBottom);
    else if (o.y >= q.box.y + q.box.height) bottom = Math.min(bottom, o.y);
  }
  const box = { x: left, y: top, width: right - left, height: bottom - top };
  // Boxes that overlap the question's own box cannot be trimmed apart: no card, so the desk shows the question's text.
  if (page.questions.some((other) => other !== q && overlaps(box, other.box))) return null;
  return { question, box, imageWidth: percent(image.width, box.width), left: -percent(box.x, box.width), top: -percent(box.y, box.height) };
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
