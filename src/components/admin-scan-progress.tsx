import Link from "next/link";
import { Table } from "@/components/admin";
import type { adminScanProgress } from "@/lib/admin-scan-progress";
import { adminWorkbookPath } from "@/lib/admin-view";
import "./admin-record.css";

type View = ReturnType<typeof adminScanProgress>;
const list = (pages: number[]) => pages.length ? pages.join(", ") : "None";

/** The book's scanned pages: accepted scans of the pages its printed days require. */
export function scanTotals(view: Pick<View, "days">): { accepted: number; required: number; percent: number } {
  const required = view.days.reduce((n, d) => n + d.required.length, 0);
  const accepted = view.days.reduce((n, d) => n + d.accepted.filter((p) => d.required.includes(p)).length, 0);
  return { accepted, required, percent: required ? Math.round((accepted / required) * 100) : 0 };
}

export function ScanHold({ number }: { number: number }) {
  return <><p role="status">No pages scanned by day 21: book {number + 1} is on hold until the family scans.</p><p>Ask the family to scan their pages.</p></>;
}
export function AdminScanProgress({ workbookId, view, missingDelivery }: { workbookId: string; view: View | null; missingDelivery: boolean | null }) {
  if (!view) return <section className="rec-scan"><h3>Scan progress</h3>
    {missingDelivery === true && <p>Delivery not confirmed. <Link href={adminWorkbookPath(workbookId)}>Confirm workbook delivered</Link>.</p>}
    <p>Scan progress is unavailable. <Link href={adminWorkbookPath(workbookId)}>Open the workbook</Link>.</p></section>;
  const t = scanTotals(view);
  return <section className="rec-scan">
    <h3>Workbook {view.number}: scan progress</h3>
    {t.required > 0 && <div className="rec-scan-bar">
      <span className="rec-bar" role="img" aria-label={`${t.accepted} of ${t.required} pages scanned`}><i style={{ width: `${t.percent}%` }} /></span>
      <span className="rec-quiet">{t.accepted} of {t.required} pages scanned</span>
    </div>}
    {view.delivery === "missing" ? <p>Delivery not confirmed. <Link href={adminWorkbookPath(workbookId)}>Confirm workbook delivered</Link>.</p>
      : view.delivery === "invalid" ? <p>Delivery information is unavailable. <Link href={adminWorkbookPath(workbookId)}>Open the workbook</Link>.</p>
      : <p>Day 21 deadline: {view.backstop ?? "Deadline unavailable"}</p>}
    <p>Day 7 snapshot: {view.claim?.reason === "day7_scanned" ? `taken ${view.claim.at}` : view.claim ? `not taken. The day 21 deadline started the next book ${view.claim.at}.` : "not taken yet"}</p>
    {view.held && <ScanHold number={view.number} />}
    {view.days.length === 0 ? <p className="adm-empty">No printed days available.</p> : <details className="rec-fold">
      <summary>Pages by day</summary>
      <Table label={`Workbook ${view.number} scanned pages`} head={["Day", "Required pages", "Accepted scans", "Gaps", "Marking and review"]} empty="No printed days available.">
        {view.days.map(day => <tr key={day.day}><td>Day {day.day}</td><td>{list(day.required)}</td><td>{list(day.accepted)}</td><td>{list(day.gaps)}</td>
          <td>{day.pages.map(page => <div key={page.number}>Page {page.number}: {page.marking}; {page.review}</div>)}</td></tr>)}
      </Table>
    </details>}
  </section>;
}
