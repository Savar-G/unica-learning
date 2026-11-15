import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import type { Database } from "@/lib/database";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { parentSchedule } from "@/lib/parent-schedule-server";
import { readWorkbooks, type ShippedBookView, type WorkbooksView } from "@/lib/parent-view";
import { parentViewReader } from "@/lib/parent-view-server";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { bookDays, mainBook, withHomeCount, type BookDays } from "@/lib/workbook-days";
import { readScanHistory } from "@/lib/scan-history";
import { scanHistoryStore } from "@/lib/scan-history-reader";
import { scanChildAccess } from "@/lib/scan-pages-access";
import { markingAccess } from "@/lib/scan-marking-server";

// One read of whether the child's Workbooks page renders, and whether it shows the saved Page history. The Workbooks page
// uses it, and so does the scan screen, which links to that history only when this says it is there (#915).

/** Null: the Workbooks page is a 404 for this family and child (no dashboard, or no workbooks tab for the child). */
export async function workbooksPage(session: SupabaseClient<Database>, parent: string, admin: SupabaseClient<Database> | null, childId: string,
  { dashboard, now = Date.now() }: { dashboard: boolean; now?: number }): Promise<{ view: WorkbooksView; historyAvailable: boolean } | null> {
  if (!dashboard) return null;
  const view = await readWorkbooks(parentViewReader(session, parent, admin), childId, now);
  if (!view) return null;
  const historyAvailable = Boolean(admin && await scanChildAccess(parent, childId, admin) && await markingAccess(admin, parent, process.env, { child: view.child.id }));
  return { view, historyAvailable };
}

/** The Workbooks page shows a history with pages in it: its history is open and the child has a shipped book. */
export const workbooksHistoryShown = (page: Awaited<ReturnType<typeof workbooksPage>>) => Boolean(page?.historyAvailable && page.view.books.length > 0);

/** The signed-in parent's Workbooks read for one child: sign-in, the dashboard and the child's ownership, else 404. */
export async function loadWorkbooksPage(childId: string) {
  const session = await sessionClient(), parent = await parentId(session);
  if (!parent) redirect("/sign-in");
  // The scan screen's "See all pages" link asks this same read.
  const page = await workbooksPage(session, parent, adminClient(), childId, { dashboard: Boolean(await parentDashboard()) });
  if (!page) notFound();
  return { ...page, parent };
}

/** The book's 10 days from its printed plan. Null when the plan cannot be read. Only the family's current book has a calendar. */
export async function workbookDaysFor(parent: string, view: WorkbooksView, book: ShippedBookView): Promise<BookDays | null> {
  const schedule = await parentSchedule(parent, view.child.id, book.id);
  if (schedule.kind !== "ready") return null;
  const isMain = mainBook(view.books)?.id === book.id;
  const days = bookDays(schedule, isMain && book.deliveredOn ? { start: book.deliveredOn, today: view.today, ended: view.child.readOnly } : null);
  // The current book's cover counts pages the way Home does, so a parent who taps Today sees the same number.
  return view.homeScan?.bookId === book.id && !days.scansUnknown ? withHomeCount(days, view.homeScan) : days;
}

/**
 * How many pages of the book our team is checking (an answer the AI was unsure of): the Page history's "Our team is
 * checking" count, read once on the server so the line above the days needs no request from the browser. 0 when there is
 * none or it cannot be read: the page then says nothing about it.
 */
export async function bookChecking(parent: string, childId: string, bookId: string, days: BookDays | null, historyAvailable: boolean): Promise<number> {
  // Only a book with its days says it above them, and only where the family has saved page results.
  const admin = days && historyAvailable ? adminClient() : null;
  if (!admin) return 0;
  try {
    // A book is a few dozen pages: one read with the largest limit holds every page our team is checking.
    const result = await readScanHistory(scanHistoryStore(admin, { parent }), { child: childId, workbook: bookId, status: "review", scannedOnly: true }, Date.now(), 100);
    return result ? result.pages.length : 0;
  } catch { return 0; }
}

/** `?day=3` opens Day 3 of the book (Home's "Today" row); anything else opens none. */
export const openDayOf = (day: string | string[] | undefined): number | null => {
  const n = typeof day === "string" && /^[0-9]{1,2}$/.test(day) ? Number(day) : null;
  return n !== null && n >= 1 && n <= 10 ? n : null;
};
