import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-store";
import { adminClient } from "@/lib/supabase-auth";
import { isUuid } from "@/lib/workbook-content";
import { readScanHistoryNow } from "@/lib/scan-history-reader";
import { AdminFrame, Table } from "@/components/admin";
const usd = (micros: number) => `USD ${(micros / 1_000_000).toFixed(4)}`;
export default async function AdminScans({ searchParams }: { searchParams: Promise<{ child?: string; workbook?: string; status?: string; after?: string }> }) {
  const admin = await requireAdmin(), q = await searchParams, db = adminClient();
  for (const value of [q.child, q.workbook, q.after]) if (value && !isUuid(value)) notFound();
  if (!db || (q.status && !["all", "review", "failed"].includes(q.status))) notFound();
  const result = await readScanHistoryNow(db, { admin: admin.userId }, { child: q.child || undefined, workbook: q.workbook || undefined, after: q.after || undefined, status: q.status as "all" | "review" | "failed" | undefined });
  if (!result) notFound();
  const c = result.costs, b = result.budget;
  return <AdminFrame email={admin.email} section="scans" title="Scan pages">
    <form className="adm-row" method="get"><label>Child ID <input name="child" defaultValue={q.child} /></label><label>Workbook ID <input name="workbook" defaultValue={q.workbook} /></label>
      <label>Show <select name="status" defaultValue={q.status ?? "all"}><option value="all">All pages</option><option value="review">Unresolved review</option><option value="failed">Failed job</option></select></label><button type="submit">Apply</button></form>
    <p>{result.pages.length} displayed pages. {result.counts.review} unresolved reviews. All list totals below use these displayed pages and their full linked spend.</p>
    <p>Reported {usd(c.reported)}. {c.logicalCalls} logical calls. {c.attempts} adapter dispatch attempts. {c.unknown} unknown charges reserve {usd(c.reserved)}.</p>
    <p>Cost per accepted page: {c.perAccepted === null ? "Unknown or no accepted page" : usd(c.perAccepted)}. {c.accepted} accepted pages. Failed and uncertain calls remain in the numerator.</p>
    {b && <p>Global month {b.period}: cap {usd(b.cap)}; reported {usd(b.reported)}; unknown reservations {usd(b.reserved)} in {b.unknown} dispatches; remaining {usd(Math.max(0, b.cap - b.held))}. The global ledger includes all families and charges whose family link was deleted.</p>}
    <Table label="Scan page history" head={["Child", "Workbook / day / page", "State", "Results"]} empty="No matching pages.">
      {result.pages.map((p) => <tr key={p.id}><td>{p.childName}</td><td>Workbook {p.book} · {p.day} · {p.pageNumber}</td><td>{p.label}{p.failedJob && " · Failed job"}</td><td>{p.photo ? <Link href={`/admin/scans/${p.photo}`}>Open scan detail</Link> : "Never scanned"}</td></tr>)}
    </Table>
    <Table label="Displayed spend by date model and outcome" head={["UTC date", "Model", "Outcome", "Attempts", "Reported USD", "Unknown reserved USD"]} empty="No dispatches for these pages.">
      {c.split.map((s) => <tr key={`${s.date}:${s.model}:${s.outcome}`}><td>{s.date}</td><td>{s.model}</td><td>{s.outcome}</td><td>{s.attempts}</td><td>{usd(s.reported)}</td><td>{usd(s.reserved)}</td></tr>)}
    </Table>
    {result.after && <Link href={`/admin/scans?${new URLSearchParams({ ...(q.child ? { child: q.child } : {}), ...(q.workbook ? { workbook: q.workbook } : {}), status: q.status ?? "all", after: result.after })}`}>More pages</Link>}
  </AdminFrame>;
}
