import { notFound } from "next/navigation";
import { WorkbookBookList } from "@/components/workbook-book-list";
import { ParentWorkbookBook } from "@/components/parent-workbooks";
import { pageMetadata } from "@/lib/metadata";
import { mainBook } from "@/lib/workbook-days";
import { bookChecking, loadWorkbooksPage, openDayOf, workbookDaysFor } from "@/lib/workbooks-page-server";

export const metadata = pageMetadata({ path: "/account/workbooks", title: "Workbook", description: "One of your child's workbooks.", index: false });

/** One of the child's shipped workbooks, the same page as the current book's (#1031). Another family's book, or one that is not shipped, is a 404. */
export default async function WorkbookBook({ params, searchParams }: PageProps<"/account/workbooks/[child]/book/[workbook]">) {
  const { child, workbook } = await params;
  const { view, parent, historyAvailable } = await loadWorkbooksPage(child);
  const book = view.books.find(b => b.id === workbook);
  if (!book) notFound();
  const days = await workbookDaysFor(parent, view, book);
  const openDay = openDayOf((await searchParams).day);
  const checking = await bookChecking(parent, view.child.id, book.id, days, historyAvailable);
  return <ParentWorkbookBook child={view.child} book={book} days={days} scanOpen={view.child.tabs.includes("scan_pages")} current={mainBook(view.books)?.id === book.id}
    list={<WorkbookBookList parent={parent} child={view.child.id} book={book.id} days={days} open={historyAvailable} openDay={openDay} checking={checking} />} />;
}
