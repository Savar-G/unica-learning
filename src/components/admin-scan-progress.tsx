import Link from "next/link";
import { Table } from "@/components/admin";
import type { adminScanProgress } from "@/lib/admin-scan-progress";
import { adminWorkbookPath } from "@/lib/admin-view";

type View = ReturnType<typeof adminScanProgress>;
const list = (pages: number[]) => pages.length ? pages.join(", ") : "None";
export function ScanHold({ number }: { number: number }) {
  return <><p role="status">No pages scanned by day 21: book {number + 1} is on hold until the family scans.</p><p>Ask the family to scan their pages.</p></>;
}
export function AdminScanProgress({ workbookId, view, missingDelivery }: { workbookId: string; view: View | null; missingDelivery: boolean | null }) {
  if (!view) return <section><h3>Scan progress</h3>
    {missingDelivery === true && <p>Delivery not confirmed. <Link href={adminWorkbookPath(workbookId)}>Confirm workbook delivered</Link>.</p>}
    <p>Scan progress is unavailable. <Link href={adminWorkbookPath(workbookId)}>Open the workbook</Link>.</p></section>;
  return <section>
    <h3>Workbook {view.number}: scan progress</h3>
    {view.delivery === "missing" ? <p>Delivery not confirmed. <Link href={adminWorkbookPath(workbookId)}>Confirm workbook delivered</Link>.</p>
      : view.delivery === "invalid" ? <p>Delivery information is unavailable. <Link href={adminWorkbookPath(workbookId)}>Open the workbook</Link>.</p>
      : <p>Day 21 backstop: {view.backstop ?? "Deadline unavailable"}</p>}
    <p>Day 7 trigger: {view.claim?.reason === "day7_scanned" ? `Claimed ${view.claim.at}` : view.claim ? `Not claimed. Backstop trigger claimed ${view.claim.at}.` : "Not claimed"}</p>
    {view.held && <ScanHold number={view.number} />}
    <Table label={`Workbook ${view.number} scanned pages`} head={["Day", "Required pages", "Accepted scans", "Gaps", "Marking and review"]} empty="No printed days available.">
      {view.days.map(day => <tr key={day.day}><td>Day {day.day}</td><td>{list(day.required)}</td><td>{list(day.accepted)}</td><td>{list(day.gaps)}</td>
        <td>{day.pages.map(page => <div key={page.number}>Page {page.number}: {page.marking}; {page.review}</div>)}</td></tr>)}
    </Table>
  </section>;
}
