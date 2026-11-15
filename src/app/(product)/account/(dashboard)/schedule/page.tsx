import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DESK_COOKIE, DESK_HOME, deskAccess } from "@/lib/desk";
import { FAMILY_DELETED_PATH } from "@/lib/family-delete";
import { pageMetadata } from "@/lib/metadata";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { SCHEDULE_PATH } from "@/lib/parent-schedule";
import { pickChild, workbookPath, workbooksPath } from "@/lib/parent-shell";
import { parentViewReader } from "@/lib/parent-view-server";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";

export const metadata = pageMetadata({ path: SCHEDULE_PATH, title: "Schedule", description: "Your child's printed workbook schedule.", index: false });

/**
 * The Schedule page is part of Workbooks now (#1031): a family on the dashboard goes to the child's Workbooks page, or to the
 * book named by `?book=` (an old reminder or email link). The old address keeps working; it only redirects.
 */
export default async function SchedulePage({ searchParams }: PageProps<"/account/schedule">) {
  const session = await sessionClient();
  const parent = await parentId(session);
  if (!parent) redirect(`/sign-in?next=${encodeURIComponent(SCHEDULE_PATH)}`);
  if (deskAccess((await cookies()).get(DESK_COOKIE)?.value, parent).state === "open") redirect(DESK_HOME);
  const dashboard = await parentDashboard();
  if (!dashboard) notFound();
  if (dashboard.deletionRequested) redirect(FAMILY_DELETED_PATH);
  const query = await searchParams;
  if (Array.isArray(query.child) || Array.isArray(query.book) || query.book === "") notFound();
  const explicit = query.child ?? null;
  if (explicit !== null && !dashboard.children.some(c => c.id === explicit)) notFound();
  // A ?book= link with no ?child= belongs to the child who owns that book, whoever the family last looked at. A book that is
  // not one of the family's shipped books is refused, as before.
  if (query.book && explicit === null) {
    const owner = (await parentViewReader(session, parent, adminClient()).shippedWorkbooks().catch(() => [])).find(w => w.id === query.book)?.childId;
    if (!owner || !dashboard.children.some(c => c.id === owner)) notFound();
    redirect(workbookPath(owner, query.book));
  }
  const child = pickChild(dashboard.children, explicit, dashboard.remembered);
  if (!child) {
    if (query.book) notFound();
    redirect("/account");
  }
  redirect(query.book ? workbookPath(child.id, query.book) : workbooksPath(child.id));
}
