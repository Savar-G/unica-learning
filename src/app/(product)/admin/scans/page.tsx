import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-store";
import { childrenOf, loadTestFamilies } from "@/lib/admin-test-families-server";
import { adminClient } from "@/lib/supabase-auth";
import { isUuid } from "@/lib/workbook-content";
import { readScanHistoryNow } from "@/lib/scan-history-reader";
import { readScanTeamQueue, teamMarkNeedsPhoto } from "@/lib/scan-team-marks";
import { pagesByBook, teamGroups } from "@/lib/admin-marking";
import { since } from "@/lib/admin-dashboard";
import { AdminTeamMark } from "@/components/admin-team-mark";
import { familyMoment } from "@/lib/family-time";
import { loadFamilyZones } from "@/lib/family-time-server";
import { readingIssueText, READING_ISSUES, type ReadingIssue } from "@/lib/scan-observation";
import { pageMetadata } from "@/lib/metadata";
import { Table, TestTag } from "@/components/admin";
import { AdminFrame } from "@/components/admin-frame";
import { MarkHead, PageBars, StateChip, WaitingCard } from "@/components/admin-marking";

export const metadata = pageMetadata({ path: "/admin/scans", title: "Admin: marking", description: "Admin area.", index: false });

const usd = (micros: number) => `USD ${(micros / 1_000_000).toFixed(4)}`;
const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Workbooks > Marking (D-313, D-315; it was "Scan pages"): the answers from scanned pages that wait for our team, one card
// per scanned page, then the shown pages per book and every scanned page. Test families follow the "Show test families"
// switch: off, their answers and pages are left out of the lists (the waiting answers in the database, before its
// limit); on, they are listed and tagged. Every number and cost on the page counts the real families only. The costs and
// the month's budget sit in a closed "Technical details" section.
export default async function AdminScans({ searchParams }: { searchParams: Promise<{ child?: string; workbook?: string; status?: string; after?: string }> }) {
  const admin = await requireAdmin(), q = await searchParams, db = adminClient();
  for (const value of [q.child, q.workbook, q.after]) if (value && !isUuid(value)) notFound();
  if (!db || (q.status && !["all", "review", "failed"].includes(q.status))) notFound();
  const view = await loadTestFamilies(admin);
  const testChildren = await childrenOf(admin, view.ids);
  // Off: test pages leave the list. On: they stay on it, out of every count and cost.
  const result = await readScanHistoryNow(db, { admin: admin.userId }, { child: q.child || undefined, workbook: q.workbook || undefined, after: q.after || undefined, status: q.status as "all" | "review" | "failed" | undefined },
    view.show ? undefined : testChildren, view.show ? testChildren : undefined);
  if (!result) notFound();
  const c = result.costs, b = result.budget;
  // #715: answers the AI was unsure of wait here for our team. No screen asks the parent to judge them.
  const team = await readScanTeamQueue(admin.db, 100, { withTests: view.show });
  const items = team.items;
  const isTestItem = (t: { testFamily: boolean; parent: string }) => view.show && (t.testFamily || view.isTest(t.parent));
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
  // The read holds the oldest answers. The count is the database's own count of the real families' answers.
  const more = team.total > team.items.length, real = team.realTotal;
  const waiting = real === 0 ? (items.length ? "No answers from real families are waiting for our team." : "No answers are waiting for our team.")
    : `${real} ${real === 1 ? "answer is" : "answers are"} waiting for our team to mark, oldest first.`;
  const now = new Date().toISOString();
  const oldest = items.filter((t) => !t.testFamily && !view.isTest(t.parent)).map((t) => t.since).sort()[0] ?? null;
  const groups = teamGroups(items);
  const books = pagesByBook(result.pages, view.show ? testChildren : new Set());
  const filtered = (key: "child" | "workbook", id: string) => `/admin/scans?${new URLSearchParams({ [key]: id })}`;
  const shownChild = q.child ? result.pages.find((p) => p.childId === q.child) : undefined;
  const shownBook = q.workbook ? result.pages.find((p) => p.workbookId === q.workbook) : undefined;
  const filterLine = q.child ? `Showing only ${shownChild ? `${shownChild.childName}'s` : "one child's"} pages${shownBook ? `, Book ${shownBook.book}` : q.workbook ? ", one book" : ""}.`
    : `Showing only ${shownBook ? `${shownBook.childName}'s Book ${shownBook.book}` : "one book's pages"}.`;
  return <AdminFrame email={admin.email} title="Marking" lead="Answers the AI was not sure of wait here for our team. Below, every scanned page." testNote={view.show}>
    <section className="adm-mk" aria-labelledby="mk-team">
      <MarkHead id="mk-team" title="Waiting for our team" count={real}>{waiting}{more && " Only the oldest are listed here."}</MarkHead>
      {real > 0 && <div className="adm-mk-sum">
        <strong>{real}</strong>
        <span><b>{real === 1 ? "answer waits" : "answers wait"} for us</b>{oldest && <span>Oldest waiting {since(oldest, now)}</span>}</span>
      </div>}
      {groups.length === 0 ? <div className="adm-mk-calm">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        <p><b>Nothing waits for us.</b> When the AI is not sure of an answer on a scanned page, it waits here for a person to mark it.</p>
      </div> : <div className="adm-mk-cards">
        {groups.map((g) => {
          const t = g.items[0];
          const action = g.photo ? <Link className="btn adm-btn" href={`/admin/scans/${g.photo}`}>Open scan to mark</Link>
            : version(t.item) === null ? <p className="adm-note">Reload the page</p>
            : needsPhoto(t.item) ? <p className="adm-note">This answer has no saved photo, and its mark would count toward progress, so it cannot be marked here. Ask the family to send a new photo of this page.</p>
            : <><p className="adm-note">No photo is saved for this answer. Mark it from what the AI read.</p><AdminTeamMark item={t.item} version={version(t.item)!} number={t.question} /></>;
          return <WaitingCard key={g.key} group={g} test={isTestItem(g)} since={familyMoment(g.since, zones.get(g.parent)!)} reason={reason} action={action} />;
        })}
      </div>}
    </section>
    <section className="adm-mk" aria-labelledby="mk-pages">
      <MarkHead id="mk-pages" title="Scanned pages" count={result.counted}>
        {pl(result.counted, "page", "pages")} shown{view.show ? ", not counting test families" : ""}. {result.counts.review} with answers our team is checking.
      </MarkHead>
      <form className="adm-filters adm-mk-filters" method="get" aria-label="Filters">
        <label>Show <select name="status" defaultValue={q.status ?? "all"}><option value="all">All pages</option><option value="review">Our team is checking</option><option value="failed">Could not mark</option></select></label>
        <details className="adm-mk-ids" open={q.child || q.workbook ? true : undefined}>
          <summary>Filter by id</summary>
          <div className="adm-mk-ids-fields">
            <label>Child id <input name="child" defaultValue={q.child} /></label>
            <label>Workbook id <input name="workbook" defaultValue={q.workbook} /></label>
          </div>
        </details>
        <button type="submit" className="btn adm-btn">Apply</button>
        <Link href="/admin/scans" className="adm-clear">Clear</Link>
      </form>
      {(q.child || q.workbook) && <p className="adm-note" role="status">
        {filterLine} <Link href="/admin/scans">Show all pages</Link>
      </p>}
      <PageBars books={books} href={(id) => filtered("workbook", id)} />
      <Table label="Scanned pages" head={["Child", "Page", "State", "Results", "Open"]} empty="No matching pages.">
        {result.pages.map((p) => <tr key={p.id}>
          <td><Link href={filtered("child", p.childId)} aria-label={`${p.childName}: show only this child's pages`}>{p.childName}</Link><TestTag test={view.show && testChildren.has(p.childId)} /></td>
          <td className="adm-nowrap"><Link href={filtered("workbook", p.workbookId)} aria-label={`Book ${p.book}: show only this book's pages`}>Book {p.book}</Link> · {p.day} · page {p.pageNumber}</td>
          <td><StateChip status={p.status} label={p.label} />{p.failedJob && <span className="adm-sub">Could not mark</span>}</td>
          <td className="adm-nowrap">{p.counts.scored > 0 ? `${p.right} right, ${p.wrong} wrong, ${p.blank} blank` : "-"}</td>
          <td className="adm-nowrap">{p.photo ? <Link href={`/admin/scans/${p.photo}`}>Open the marked page</Link> : "Never scanned"}</td>
        </tr>)}
      </Table>
      {result.after && <p className="adm-mk-more"><Link href={`/admin/scans?${new URLSearchParams({ ...(q.child ? { child: q.child } : {}), ...(q.workbook ? { workbook: q.workbook } : {}), status: q.status ?? "all", after: result.after })}`}>More pages</Link></p>}
    </section>
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
