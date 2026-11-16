import { ScanHistory } from "@/components/scan-history";
import { WorkbookDays } from "@/components/workbook-days";
import type { BookDays } from "@/lib/workbook-days";

/**
 * What a book shows for its saved page results (#1031). With its printed plan: the 10 days, each opening to its pages. When
 * the plan cannot be read there are no days to open, so a family whose page results are open gets the plain page list for
 * this book (the Page history). The Scan tab's "See all pages" link goes to `#page-history`, which is here in both cases. A
 * family with no page results open, and no days, gets nothing. `checking`: pages our team is checking, said above the days.
 */
export function WorkbookBookList({ parent, child, book, days, open, openDay, checking }: {
  parent: string; child: string; book: string; days: BookDays | null; open: boolean; openDay: number | null; checking: number;
}) {
  if (days) return <WorkbookDays parent={parent} child={child} book={book} weeks={days.weeks} openDay={openDay} open={open} checking={checking} />;
  return open ? <div id="page-history"><ScanHistory parent={parent} child={child} books={[book]} /></div> : null;
}
