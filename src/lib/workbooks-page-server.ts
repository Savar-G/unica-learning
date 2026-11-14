import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { readWorkbooks, type WorkbooksView } from "@/lib/parent-view";
import { parentViewReader } from "@/lib/parent-view-server";
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
