// Pure projection for #475. The store adapter must supply admitted durable records, never browser claims.
import { addDays, localDateTime, localDay, normalizeTimeZone, partsInZone, type FamilyZone } from "@/lib/family-time";
import { completedPage, type HistoryPage } from "@/lib/scan-history";
import type { ItemIdentity } from "@/lib/scan-observation";
import { deliveryDeadlines, type DeliveryReceipt } from "@/lib/workbook-delivery";
import { canonical } from "@/lib/workbook-digest";
import { isPrintedRevision, manifestProblem, SNAPSHOT_DAY, type ScanManifest } from "@/lib/workbook-print-contract";

export interface ScanProgressIdentity extends Pick<ItemIdentity, "workbookId" | "printedRevision" | "pageId"> {
  parentId: string;
  childId: string;
}

/** This is an admitted record, not an admission API. Photo lifecycle is deliberately absent. */
export interface AcceptedScanReceipt extends ScanProgressIdentity {
  id: string;
  status: "accepted";
  photoRevision: string;
  acceptedAt: string;
}

/**
 * A separate durable admission by the authoritative store. It must prove the accepted retake resolved pending items
 * while preserving finalized results and parent changes. This projection cannot prove those facts from these fields.
 */
export interface AdmittedScanProgressEvent extends ScanProgressIdentity {
  id: string;
  reason: "pending-evidence-resolved";
  receiptId: string;
  admittedAt: string;
  resolvedItemIds: readonly string[];
}

export interface ScanProgressBook {
  workbookId: string;
  parentId: string;
  childId: string;
  number: number;
  printedRevision: string;
  manifest: ScanManifest;
  /** Frozen page-number to page-ID mapping from the same published revision as the manifest. */
  pages: readonly (Parameters<typeof manifestProblem>[1][number] & { id: string })[];
  /** The effective per-book receipt, including an authorized correction when present. */
  delivery: DeliveryReceipt | null;
}

export interface ScanProgressInput {
  book: ScanProgressBook;
  receipts: readonly AcceptedScanReceipt[];
  progressEvents?: readonly AdmittedScanProgressEvent[];
  /** Already scoped canonical marking history. It never establishes scan acceptance. */
  reviews?: readonly { parentId: string; page: HistoryPage }[];
  now: number;
}

export interface PrintedDayScanProgress {
  day: number;
  requiredPages: string[];
  acceptedPages: string[];
  gaps: string[];
  complete: boolean;
}

type DeliveryProgress =
  | { status: "missing" | "invalid" }
  | { status: "confirmed"; deliveredAt: string; reminderAt: string; backstopAt: string };

export type WorkbookScanProgress =
  | { status: "refused"; reason: "invalid-clock" | "invalid-workbook" }
  | {
    status: "available";
    workbookId: string;
    days: PrintedDayScanProgress[];
    pages: { pageId: string; scanned: boolean; receiptIds: string[]; markingStatus: HistoryPage["status"] | null; reviewReady: boolean | null }[];
    acceptedPageCount: number;
    unfinished: boolean;
    day7Ready: boolean;
    delivery: DeliveryProgress;
    /** Readiness only. No durable trigger, arbitration, snapshot, or draft is claimed here. */
    candidate: "day7_scanned" | "delivery_backstop" | null;
    holdReason: "no-accepted-scans-at-backstop" | null;
    lastQualifyingScanAt: string | null;
  };

const instant = (at: string) => Date.parse(at);
const sameBook = (book: ScanProgressBook, row: Omit<ScanProgressIdentity, "pageId">) =>
  row.parentId === book.parentId && row.childId === book.childId && row.workbookId === book.workbookId && row.printedRevision === book.printedRevision;
const positive = (n: number) => Number.isSafeInteger(n) && n > 0;

/** Exact repeats collapse. Conflicting records with one durable ID are all excluded, independent of input order. */
function uniqueRecords<T extends { id: string }>(rows: readonly T[]): T[] {
  const byId = new Map<string, T>();
  const conflicts = new Set<string>();
  for (const row of rows) {
    if (!row.id) continue;
    const held = byId.get(row.id);
    if (held && JSON.stringify(canonical(held)) !== JSON.stringify(canonical(row))) conflicts.add(row.id);
    else byId.set(row.id, row);
  }
  return [...byId.values()].filter((r) => !conflicts.has(r.id));
}

function validBook(book: ScanProgressBook): boolean {
  if (!book.workbookId || !book.parentId || !book.childId || !positive(book.number) || !isPrintedRevision(book.printedRevision)) return false;
  if (book.pages.some((p) => !p.id || !positive(p.number))) return false;
  if (new Set(book.pages.map((p) => p.id)).size !== book.pages.length || new Set(book.pages.map((p) => p.number)).size !== book.pages.length) return false;
  const m = book.manifest;
  if (manifestProblem(m, book.pages) || m.snapshotDay !== SNAPSHOT_DAY || !m.days.some((d) => d.day === SNAPSHOT_DAY)) return false;
  return new Set(m.days.map((d) => d.day)).size === m.days.length;
}

function deliveryProgress(book: ScanProgressBook, now: number): DeliveryProgress {
  const r = book.delivery;
  if (!r) return { status: "missing" };
  const zone = typeof r.timeZone === "string" ? r.timeZone : r.timeZone.zone;
  if (r.parentId !== book.parentId || r.childId !== book.childId || r.workbookId !== book.workbookId || r.number !== book.number
    || !normalizeTimeZone(zone) || (typeof r.timeZone !== "string" && r.timeZone.override !== false)
    || !Number.isFinite(instant(r.deliveredAt)) || instant(r.deliveredAt) > now) return { status: "invalid" };
  return { status: "confirmed", deliveredAt: r.deliveredAt, ...deliveryDeadlines(r) };
}

export function workbookScanProgress(input: ScanProgressInput): WorkbookScanProgress {
  const { book, now } = input;
  if (!Number.isFinite(now)) return { status: "refused", reason: "invalid-clock" };
  if (!validBook(book)) return { status: "refused", reason: "invalid-workbook" };
  const byNumber = new Map(book.pages.map((p) => [p.number, p.id]));
  const required = new Set(book.manifest.days.flatMap((d) => d.pages.map((n) => byNumber.get(n)!)));
  const receipts = uniqueRecords(input.receipts).filter((r) => r.status === "accepted" && sameBook(book, r)
    && required.has(r.pageId) && !!r.photoRevision && Number.isFinite(instant(r.acceptedAt)) && instant(r.acceptedAt) <= now)
    .sort((a, b) => instant(a.acceptedAt) - instant(b.acceptedAt) || a.id.localeCompare(b.id));
  const first = new Map<string, AcceptedScanReceipt>();
  for (const r of receipts) if (!first.has(r.pageId)) first.set(r.pageId, r);
  const days = [...book.manifest.days].sort((a, b) => a.day - b.day).map((d): PrintedDayScanProgress => {
    const requiredPages = [...d.pages].sort((a, b) => a - b).map((n) => byNumber.get(n)!);
    const acceptedPages = requiredPages.filter((id) => first.has(id)), gaps = requiredPages.filter((id) => !first.has(id));
    return { day: d.day, requiredPages, acceptedPages, gaps, complete: gaps.length === 0 };
  });
  const byReceipt = new Map(receipts.map((r) => [r.id, r]));
  const qualifying = [...first.values()].map((r) => instant(r.acceptedAt));
  for (const e of uniqueRecords(input.progressEvents ?? [])) {
    const r = byReceipt.get(e.receiptId);
    if (!r || !sameBook(book, e) || e.pageId !== r.pageId || e.reason !== "pending-evidence-resolved"
      || e.resolvedItemIds.length === 0 || e.resolvedItemIds.some((id) => !id)
      || new Set(e.resolvedItemIds).size !== e.resolvedItemIds.length
      || !Number.isFinite(instant(e.admittedAt)) || instant(e.admittedAt) > now || instant(e.admittedAt) < instant(r.acceptedAt)
      || instant(r.acceptedAt) <= instant(first.get(r.pageId)!.acceptedAt)) continue;
    // Use the scan time, not a delayed job's admission time, for the inactivity anchor.
    qualifying.push(instant(r.acceptedAt));
  }
  const pages = [...required].map((pageId) => {
    const reviews = (input.reviews ?? []).filter(({ parentId, page: p }) => parentId === book.parentId
      && p.childId === book.childId && p.workbookId === book.workbookId && p.book === book.number
      && p.revision === book.printedRevision && p.id === pageId);
    const review = reviews.length === 1 ? reviews[0].page : null;
    return { pageId, scanned: first.has(pageId), receiptIds: receipts.filter((r) => r.pageId === pageId).map((r) => r.id),
      markingStatus: review?.status ?? null, reviewReady: review ? completedPage(review) : null };
  });
  const day7Ready = days.find((d) => d.day === SNAPSHOT_DAY)!.complete;
  const delivery = deliveryProgress(book, now);
  const backstopDue = delivery.status === "confirmed" && now >= instant(delivery.backstopAt);
  return { status: "available", workbookId: book.workbookId, days, pages, acceptedPageCount: first.size,
    unfinished: days.some((d) => !d.complete), day7Ready, delivery,
    candidate: delivery.status !== "confirmed" ? null : day7Ready ? "day7_scanned" : backstopDue && first.size > 0 ? "delivery_backstop" : null,
    holdReason: backstopDue && first.size === 0 ? "no-accepted-scans-at-backstop" : null,
    lastQualifyingScanAt: qualifying.length ? new Date(Math.max(...qualifying)).toISOString() : null };
}

export type ScanInactivityCandidate =
  | { status: "none"; reason: "missing-delivery" | "finished" }
  | { status: "refused"; reason: "ambiguous-books" | "invalid-input" }
  | { status: "candidate"; workbookId: string; anchorAt: string; dueAt: string; due: boolean };

/**
 * Newer numbered confirmed books suppress older reminders even when the newer book is complete. All books remain
 * independently scannable. Selection and due status are projections only; no episode or send reservation is made.
 */
export function scanInactivityCandidate(input: Omit<ScanProgressInput, "book"> & {
  parentId: string; childId: string; books: readonly ScanProgressBook[]; timeZone: FamilyZone;
}): ScanInactivityCandidate {
  if (!Number.isFinite(input.now) || !normalizeTimeZone(typeof input.timeZone === "string" ? input.timeZone : input.timeZone.zone)
    || (typeof input.timeZone !== "string" && input.timeZone.override !== false)) return { status: "refused", reason: "invalid-input" };
  const books = input.books.filter((b) => b.parentId === input.parentId && b.childId === input.childId);
  if (new Set(books.map((b) => b.workbookId)).size !== books.length || new Set(books.map((b) => b.number)).size !== books.length) return { status: "refused", reason: "ambiguous-books" };
  if (books.some((b) => b.delivery && deliveryProgress(b, input.now).status === "invalid")) return { status: "refused", reason: "invalid-input" };
  const book = books.filter((b) => b.delivery).sort((a, b) => b.number - a.number)[0];
  if (!book) return { status: "none", reason: "missing-delivery" };
  const progress = workbookScanProgress({ ...input, book });
  if (progress.status !== "available" || progress.delivery.status !== "confirmed") return { status: "refused", reason: "invalid-input" };
  if (!progress.unfinished) return { status: "none", reason: "finished" };
  const deliveryAt = instant(progress.delivery.deliveredAt);
  const scanAt = progress.lastQualifyingScanAt ? instant(progress.lastQualifyingScanAt) : -Infinity;
  const anchor = Math.max(deliveryAt, scanAt);
  // Delivery-only anchors use the receipt's recorded family zone and the existing delivery deadline.
  // Later scans use the caller's resolved family zone. Do not substitute a repeat-confirmation record time.
  const p = partsInZone(anchor, input.timeZone, { hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
  const due = scanAt <= deliveryAt ? instant(progress.delivery.reminderAt)
    : localDateTime(addDays(localDay(anchor, input.timeZone), 4), input.timeZone, +p.hour, +p.minute, +p.second) + anchor % 1000;
  return { status: "candidate", workbookId: book.workbookId, anchorAt: new Date(anchor).toISOString(), dueAt: new Date(due).toISOString(), due: input.now >= due };
}
