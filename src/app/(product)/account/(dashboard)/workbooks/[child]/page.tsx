import { notFound, redirect } from "next/navigation";
import { ParentWorkbooks } from "@/components/parent-workbooks";
import { ScanHistory, ScanHistoryView } from "@/components/scan-history";
import { pageMetadata } from "@/lib/metadata";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { readWorkbooks } from "@/lib/parent-view";
import { parentViewReader } from "@/lib/parent-view-server";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { scanChildAccess } from "@/lib/scan-pages-access";
import { markingAccess } from "@/lib/scan-marking-server";

export const metadata = pageMetadata({ path: "/account/workbooks", title: "Workbooks", description: "Your child's workbooks.", index: false });

/** Whole answer keys follow delivery. Saved page history follows the independent scan and marking gates. */
async function load(childId: string) {
  const session = await sessionClient(), parent = await parentId(session);
  if (!parent) redirect("/sign-in");
  if (!(await parentDashboard())) notFound();
  const admin = adminClient();
  const view = await readWorkbooks(parentViewReader(session, parent, admin), childId, Date.now());
  if (!view) notFound();
  const historyAvailable = admin && await scanChildAccess(parent, childId, admin) && await markingAccess(admin, parent);
  return { view, parent, historyAvailable };
}

export default async function Workbooks({ params }: PageProps<"/account/workbooks/[child]">) {
  const { view, parent, historyAvailable } = await load((await params).child);
  return <ParentWorkbooks {...view} history={historyAvailable
    ? <ScanHistory parent={parent} child={view.child.id} books={view.books.map(book => book.id)} />
    : <ScanHistoryView state="unavailable" />} />;
}
