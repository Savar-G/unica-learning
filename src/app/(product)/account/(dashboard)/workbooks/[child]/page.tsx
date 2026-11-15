import { WorkbookDays } from "@/components/workbook-days";
import { ParentWorkbooks } from "@/components/parent-workbooks";
import { pageMetadata } from "@/lib/metadata";
import { mainBook } from "@/lib/workbook-days";
import { loadWorkbooksPage, openDayOf, workbookDaysFor } from "@/lib/workbooks-page-server";

export const metadata = pageMetadata({ path: "/account/workbooks", title: "Workbooks", description: "Your child's workbooks.", index: false });

/** The child's current workbook with its 10 days, then the next workbook, answer keys and older books (#1031). Whole answer
 * keys follow delivery. The saved page results in each day follow the independent scan and marking gates. */
export default async function Workbooks({ params, searchParams }: PageProps<"/account/workbooks/[child]">) {
  const { view, parent, historyAvailable } = await loadWorkbooksPage((await params).child);
  const main = mainBook(view.books);
  const days = main ? await workbookDaysFor(parent, view, main) : null;
  const openDay = openDayOf((await searchParams).day);
  return <ParentWorkbooks view={view} days={days} scanOpen={view.child.tabs.includes("scan_pages")}
    list={days && main && <WorkbookDays parent={parent} child={view.child.id} book={main.id} weeks={days.weeks} openDay={openDay} open={historyAvailable} />} />;
}
