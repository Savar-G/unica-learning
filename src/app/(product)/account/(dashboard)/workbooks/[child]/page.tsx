import { notFound, redirect } from "next/navigation";
import { ParentWorkbooks } from "@/components/parent-workbooks";
import { ScanHistory, ScanHistoryView } from "@/components/scan-history";
import { pageMetadata } from "@/lib/metadata";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { workbooksPage } from "@/lib/workbooks-page-server";

export const metadata = pageMetadata({ path: "/account/workbooks", title: "Workbooks", description: "Your child's workbooks.", index: false });

/** Whole answer keys follow delivery. Saved page history follows the independent scan and marking gates. */
async function load(childId: string) {
  const session = await sessionClient(), parent = await parentId(session);
  if (!parent) redirect("/sign-in");
  // The scan screen's "See all pages" link asks this same read (src/lib/workbooks-page-server.ts).
  const page = await workbooksPage(session, parent, adminClient(), childId, { dashboard: Boolean(await parentDashboard()) });
  if (!page) notFound();
  return { ...page, parent };
}

export default async function Workbooks({ params }: PageProps<"/account/workbooks/[child]">) {
  const { view, parent, historyAvailable } = await load((await params).child);
  return <ParentWorkbooks {...view} history={historyAvailable
    ? <ScanHistory parent={parent} child={view.child.id} books={view.books.map(book => book.id)} />
    : <ScanHistoryView state="unavailable" />} />;
}
