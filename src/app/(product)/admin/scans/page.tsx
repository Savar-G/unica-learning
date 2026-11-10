import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-store";
import { childrenOf, loadTestFamilies } from "@/lib/admin-test-families-server";
import { adminClient } from "@/lib/supabase-auth";
import { isUuid } from "@/lib/workbook-content";
import { readScanHistoryNow } from "@/lib/scan-history-reader";
import { readScanTeamQueue, teamMarkNeedsPhoto } from "@/lib/scan-team-marks";
import { AdminTeamMark } from "@/components/admin-team-mark";
import { familyMoment } from "@/lib/family-time";
import { loadFamilyZones } from "@/lib/family-time-server";
import { readingIssueText, READING_ISSUES, type ReadingIssue } from "@/lib/scan-observation";
import { pageMetadata } from "@/lib/metadata";
import { Table, TestTag } from "@/components/admin";
import { AdminFrame } from "@/components/admin-frame";

export const metadata = pageMetadata({ path: "/admin/scans", title: "Admin: marking", description: "Admin area.", index: false });

const usd = (micros: number) => `USD ${(micros / 1_000_000).toFixed(4)}`;

// Marking (D-313; it was "Scan pages"): the answers from scanned pages that wait for our team, then every scanned page.
// Test families follow the "Show test families" switch: off, their answers and pages are left out of the lists and the
// costs. The costs and the month's budget sit in a closed "Technical details" section.
export default async function AdminScans({ searchParams }: { searchParams: Promise<{ child?: string; workbook?: string; status?: string; after?: string; tests?: string }> }) {
  const admin = await requireAdmin(), q = await searchParams, db = adminClient();
  for (const value of [q.child, q.workbook, q.after]) if (value && !isUuid(value)) notFound();
  if (!db || (q.status && !["all", "review", "failed"].includes(q.status))) notFound();
  const view = await loadTestFamilies(admin, q);
  const testChildren = await childrenOf(admin, view.ids);
  const result = await readScanHistoryNow(db, { admin: admin.userId }, { child: q.child || undefined, workbook: q.workbook || undefined, after: q.after || undefined, status: q.status as "all" | "review" | "failed" | undefined },
    view.show ? undefined : testChildren);
  if (!result) notFound();
  const c = result.costs, b = result.budget;
  // #715: answers the AI was unsure of wait here for our team. No screen asks the parent to judge them.
  const team = await readScanTeamQueue(admin.db);
  const items = team.items.filter((t) => view.show || !(t.testFamily || view.isTest(t.parent)));
  const isTestItem = (t: (typeof items)[number]) => view.show && (t.testFamily || view.isTest(t.parent));
  // A waiting answer with no photo is still marked here, at the version its own row holds.
  const noPhoto = items.filter((t) => !t.photo).map((t) => t.item);
  const versions = noPhoto.length ? await db.from("scan_marking_items").select("id,result_version,expected,original_event").in("id", noPhoto) : { data: [], error: null };
  if (versions.error) throw new Error("team_queue_versions");
  // "Waiting since" in each family's own time zone (the shared rule in src/lib/family-time.ts).
  const zones = await loadFamilyZones(db, items.map((t) => t.parent));
  const row = (item: string) => (versions.data ?? []).find((v) => v.id === item);
  const version = (item: string) => row(item)?.result_version ?? null;
  // One rule with admin_set_scan_mark: no buttons where the mark cannot be saved.
  const needsPhoto = (item: string) => {
    const r = row(item), e = r?.expected;
    const eligible = !!e && typeof e === "object" && !Array.isArray(e) && !!e.mastery && typeof e.mastery === "object" && !Array.isArray(e.mastery) && e.mastery.eligible === true;
    return !!r && teamMarkNeedsPhoto({ eligible, hasEvent: r.original_event !== null, photo: null });
  };
  const reason = (issue: string | null) => issue && READING_ISSUES.includes(issue as ReadingIssue) ? readingIssueText(issue as ReadingIssue) : "Waiting for a person to mark it.";
  // The read holds the oldest answers; past them the count is at least what it shows.
  const more = team.total > team.items.length;
  const waiting = items.length === 0 && !more ? "No answers are waiting for our team."
    : `${items.length}${more ? " or more" : ""} ${items.length === 1 && !more ? "answer is" : "answers are"} waiting for our team to mark, oldest first.`;
  return <AdminFrame email={admin.email} title="Marking" lead="Answers from scanned pages that our team must check, and every scanned page." testNote={view.show}>
    <h2>Waiting for our team</h2>
    <p>{waiting}{more && ` The oldest ${team.items.length} are read here.`}</p>
    {items.length > 0 && <Table label="Answers waiting for our team" head={["Child", "Workbook / page / question", "What the AI read", "Why it is waiting", "Waiting since", "Open"]} empty="None.">
      {items.map((t) => <tr key={t.item}><td>{t.childName}<TestTag test={isTestItem(t)} /></td><td>Workbook {t.book} · page {t.page} · question {t.question}</td>
        <td>{t.read === null ? "Not read" : t.read === "" ? "Empty" : t.read}</td><td>{reason(t.issue)}</td><td>{familyMoment(t.since, zones.get(t.parent)!)}</td>
        <td>{t.photo ? <Link href={`/admin/scans/${t.photo}`}>Open scan to mark</Link>
          : version(t.item) === null ? "Reload the page" : needsPhoto(t.item) ? "This answer has no saved photo, and its mark would count toward progress, so it cannot be marked here. Ask the family to send a new photo of this page."
            : <>No photo is saved for this answer. Mark it from what the AI read.<AdminTeamMark item={t.item} version={version(t.item)!} number={t.question} /></>}</td></tr>)}
    </Table>}
    <h2>Scanned pages</h2>
    <form className="adm-filters" method="get" aria-label="Filters">
      <label>Child id <input name="child" defaultValue={q.child} /></label>
      <label>Workbook id <input name="workbook" defaultValue={q.workbook} /></label>
      <label>Show <select name="status" defaultValue={q.status ?? "all"}><option value="all">All pages</option><option value="review">Our team is checking</option><option value="failed">Could not mark</option></select></label>
      <button type="submit" className="btn adm-btn">Apply</button>
      <Link href="/admin/scans" className="adm-clear">Clear</Link>
    </form>
    <p>{result.pages.length} {result.pages.length === 1 ? "page" : "pages"} shown. {result.counts.review} with answers our team is checking.</p>
    <Table label="Scanned pages" head={["Child", "Workbook / day / page", "State", "Results"]} empty="No matching pages.">
      {result.pages.map((p) => <tr key={p.id}><td>{p.childName}<TestTag test={view.show && testChildren.has(p.childId)} /></td><td>Workbook {p.book} · {p.day} · {p.pageNumber}</td><td>{p.label}{p.failedJob && " · Could not mark"}</td><td>{p.photo ? <Link href={`/admin/scans/${p.photo}`}>Open the marked page</Link> : "Never scanned"}</td></tr>)}
    </Table>
    {result.after && <p><Link href={`/admin/scans?${new URLSearchParams({ ...(q.child ? { child: q.child } : {}), ...(q.workbook ? { workbook: q.workbook } : {}), status: q.status ?? "all", after: result.after })}`}>More pages</Link></p>}
    <details className="adm-tech">
      <summary>Technical details</summary>
      <p>The cost of the AI that read the pages shown: {usd(c.reported)} reported. {c.logicalCalls} {c.logicalCalls === 1 ? "call" : "calls"}, sent {c.attempts} {c.attempts === 1 ? "time" : "times"}. {c.unknown} {c.unknown === 1 ? "call has" : "calls have"} no cost yet; {usd(c.reserved)} is held for them.</p>
      <p>Cost per finished page: {c.perAccepted === null ? "not known, or no finished page" : usd(c.perAccepted)}, over {c.accepted} finished {c.accepted === 1 ? "page" : "pages"}. Failed and uncertain calls count in the cost.</p>
      {b && <p>This month ({b.period}), for every family together: limit {usd(b.cap)}; reported {usd(b.reported)}; held {usd(b.reserved)} for {b.unknown} {b.unknown === 1 ? "call" : "calls"} with no cost yet; left {usd(Math.max(0, b.cap - b.held))}. It counts every family, test families and deleted families too.</p>}
      <Table label="Cost by day, model and result" head={["Date (UTC)", "Model", "Result", "Sent", "Reported", "Held"]} empty="No AI calls for these pages.">
        {c.split.map((s) => <tr key={`${s.date}:${s.model}:${s.outcome}`}><td>{s.date}</td><td>{s.model}</td><td>{s.outcome}</td><td>{s.attempts}</td><td>{usd(s.reported)}</td><td>{usd(s.reserved)}</td></tr>)}
      </Table>
    </details>
  </AdminFrame>;
}
