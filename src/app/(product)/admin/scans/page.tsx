import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-store";
import { adminClient } from "@/lib/supabase-auth";
import { isUuid } from "@/lib/workbook-content";
import { readScanHistoryNow } from "@/lib/scan-history-reader";
import { readScanTeamQueue } from "@/lib/scan-team-marks";
import { AdminTeamMark } from "@/components/admin-team-mark";
import { readingIssueText, READING_ISSUES, type ReadingIssue } from "@/lib/scan-observation";
import { AdminFrame, Table } from "@/components/admin";
const usd = (micros: number) => `USD ${(micros / 1_000_000).toFixed(4)}`;
export default async function AdminScans({ searchParams }: { searchParams: Promise<{ child?: string; workbook?: string; status?: string; after?: string }> }) {
  const admin = await requireAdmin(), q = await searchParams, db = adminClient();
  for (const value of [q.child, q.workbook, q.after]) if (value && !isUuid(value)) notFound();
  if (!db || (q.status && !["all", "review", "failed"].includes(q.status))) notFound();
  const result = await readScanHistoryNow(db, { admin: admin.userId }, { child: q.child || undefined, workbook: q.workbook || undefined, after: q.after || undefined, status: q.status as "all" | "review" | "failed" | undefined });
  if (!result) notFound();
  const c = result.costs, b = result.budget;
  // #715: answers the AI was unsure of wait here for our team. No screen asks the parent to judge them.
  const team = await readScanTeamQueue(admin.db);
  // A waiting answer with no photo is still marked here, at the version its own row holds.
  const noPhoto = team.items.filter((t) => !t.photo).map((t) => t.item);
  const versions = noPhoto.length ? await db.from("scan_marking_items").select("id,result_version").in("id", noPhoto) : { data: [], error: null };
  if (versions.error) throw new Error("team_queue_versions");
  const version = (item: string) => (versions.data ?? []).find((v) => v.id === item)?.result_version ?? null;
  const reason = (issue: string | null) => issue && READING_ISSUES.includes(issue as ReadingIssue) ? readingIssueText(issue as ReadingIssue) : "Waiting for a person to mark it.";
  return <AdminFrame email={admin.email} section="scans" title="Scan pages">
    <h2>Waiting for our team</h2>
    <p>{team.total === 0 ? "No answers are waiting for our team." : `${team.total} ${team.total === 1 ? "answer is" : "answers are"} waiting for our team to mark, oldest first.`}
      {team.total > team.items.length && ` The first ${team.items.length} are below.`}</p>
    {team.items.length > 0 && <Table label="Answers waiting for our team" head={["Child", "Workbook / page / question", "What the AI read", "Why it is waiting", "Waiting since", "Open"]} empty="None.">
      {team.items.map((t) => <tr key={t.item}><td>{t.childName}{t.testFamily && " (test family)"}</td><td>Workbook {t.book} · page {t.page} · question {t.question}</td>
        <td>{t.read === null ? "Not read" : t.read === "" ? "Empty" : t.read}</td><td>{reason(t.issue)}</td><td>{t.since}</td>
        <td>{t.photo ? <Link href={`/admin/scans/${t.photo}`}>Open scan to mark</Link>
          : <>No photo is saved for this answer. Mark it from what the AI read.{version(t.item) !== null && <AdminTeamMark item={t.item} version={version(t.item)!} number={t.question} />}</>}</td></tr>)}
    </Table>}
    <form className="adm-row" method="get"><label>Child ID <input name="child" defaultValue={q.child} /></label><label>Workbook ID <input name="workbook" defaultValue={q.workbook} /></label>
      <label>Show <select name="status" defaultValue={q.status ?? "all"}><option value="all">All pages</option><option value="review">Our team is checking</option><option value="failed">Could not mark</option></select></label><button type="submit">Apply</button></form>
    <p>{result.pages.length} displayed pages. {result.counts.review} with answers our team is checking. All list totals below use these displayed pages and their full linked spend.</p>
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
