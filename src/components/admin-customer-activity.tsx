import Link from "next/link";
import { Table, TestTag } from "@/components/admin";
import { CustomerContactNote } from "@/components/customer-contact-note";
import { loadCustomerActivity, loadCustomerBook, type CustomerFilters } from "@/lib/customer-activity-server";
import { inactivity, progressSummary } from "@/lib/customer-activity";
import type { AdminSession } from "@/lib/admin-store";
import { familyWhen } from "@/lib/family-time";
import "./admin-record.css";

const at = (v: string | null) => v ? new Date(v).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC") : "Not recorded";
const title = (v: string) => v.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
const TYPES = ["account", "assessment", "scan", "mark", "maya", "delivery", "workbook", "plan", "feedback", "email", "note", "visit", "attempt"];
const ACTORS = ["parent", "child", "team", "system", "unknown"];
export async function CustomerActivityPanel({ admin, filters: f, tests, path = "/admin/customer-activity", embedded = false, now }: {
  admin: AdminSession; filters: CustomerFilters; tests: boolean; path?: string; embedded?: boolean; now: number;
}) {
  const data = await loadCustomerActivity(admin, f, tests);
  const children = data.children.data?.slice(0, 25) ?? [], history = data.history.data?.slice(0, 50) ?? [], m = data.metrics.data;
  const familyNames = new Map([...children.map(c => [c.parent, c.family] as const), ...history.map(r => [r.parent, r.familyName] as const)]);
  if (f.parent && !familyNames.has(f.parent)) familyNames.set(f.parent, "Selected family");
  const families = [...familyNames.entries()];
  const href = (change: Record<string, string | null>) => {
    const q = new URLSearchParams({ from: f.from, to: f.to });
    for (const [k, v] of Object.entries({ attention: f.attention, family: f.parent, child: f.child, book: f.book, type: f.type, actor: f.actor, search: f.search,
      childrenAfter: f.childrenAfter, after: f.cursor ? `${f.cursor.at}|${f.cursor.key}` : null, ...change })) if (v) q.set(k, v);
    return `${path}?${q}`;
  };
  const chosen = children.find(c => (!f.child || c.id === f.child) && (!f.parent || c.parent === f.parent) && c.books.some(b => b.id === f.book));
  const selectedBook = chosen?.books.find(b => b.id === f.book);
  const book = chosen && selectedBook ? await loadCustomerBook(admin, chosen.parent, chosen.id, selectedBook.id) : null;
  const summary = book ? progressSummary(book.progress) : null;
  return <div>
    <form className="adm-filters" action={path}>
      {embedded ? <input type="hidden" name="family" value={f.parent ?? ""} /> : <>
        <label>Find family or child<input name="search" maxLength={80} defaultValue={f.search ?? ""} /></label>
        <label>Family<select name="family" defaultValue={f.parent ?? ""}><option value="">All families</option>{families.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      </>}
      <label>Child<select name="child" defaultValue={f.child ?? ""}><option value="">All children</option>{children.map(c => <option key={c.id} value={c.id}>{c.name} ({c.family})</option>)}</select></label>
      <label>Book<select name="book" defaultValue={f.book ?? ""}><option value="">All books</option>{children.flatMap(c => c.books.map(b => <option key={b.id} value={b.id}>{c.name}: Book {b.number}</option>))}</select></label>
      <label>From (UTC)<input type="date" name="from" defaultValue={f.from} required /></label>
      <label>Before (UTC)<input type="date" name="to" defaultValue={f.to} required /></label>
      <label>Needs attention<select name="attention" defaultValue={f.attention ?? ""}><option value="">All children</option><option value="team">Awaiting team</option><option value="assessment">Assessment not completed</option></select></label>
      <label>Type<select name="type" defaultValue={f.type ?? ""}><option value="">All types</option>{TYPES.map(t => <option key={t} value={t}>{title(t)}</option>)}</select></label>
      <label>Actor<select name="actor" defaultValue={f.actor ?? ""}><option value="">All actors</option>{ACTORS.map(a => <option key={a} value={a}>{title(a)}</option>)}</select></label>
      <button className="btn ghost adm-btn">Apply filters</button><Link prefetch={false} href={path}>Reset</Link>
    </form>
    <p className="adm-note">History uses the selected period. The attention filter selects child summaries. Period metrics always cover all real families. Child and book states are current. Visits are optional and incomplete. An attempt does not prove a completed action or abandonment. Missing scans do not prove missing paper work.</p>
    {!embedded && <section className="rec-sec"><h2>Period summary</h2>
      {!m ? <p role="alert">Summary unavailable. No counts are shown.</p> : <>
        <Table label="Real family period summary" head={["Measure", "Observed value", "Basis"]} empty="No summary available.">
          {[
            ["Active families", `${m.activeFamilies} of ${m.families}`, "Current retained real families with a qualifying scan, assessment answer or Maya participation in the period."],
            ["Maya use", `${m.mayaFamilies} of ${m.families} families`, "At least one child turn in a family session started in the period."],
            ["Delivery to first scan", m.medianFirstScanHours === null ? "Not available" : `${m.medianFirstScanHours.toFixed(1)} hours (median)`, `${m.deliveryWithScan} of ${m.deliveredBooks} books delivered in the period have a first scan after delivery and before the period ends. ${m.deliveryMissingScan} have no first scan. ${m.deliveryEarlierScan} have a scan before delivery. ${m.deliveryAfterPeriod} first scanned after the period. ${m.deliveryMissingContract} have no print evidence.`],
            ["Awaiting team", `${m.awaitingTeamFamilies} families`, "Current pending marks under the marking module's team rule. This is not a period count."],
            ["Selected book completion", summary ? `${summary.scannedDays} of ${summary.days.length} days scanned; ${summary.markedDays ?? "Unknown"} days fully marked` : "Select a book below", "Scanned and fully marked completion use the canonical frozen-page reader for the selected book. No paper-completion claim is made."],
          ].map(([label, value, basis]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td><td>{basis}</td></tr>)}
        </Table>
        <p className="adm-note">All metrics exclude test and team families. Missing delivery and print contracts stay outside delivery and completion evidence. Activity storage available since: {at(m.telemetryStart)}. Collection starts only after deployment and consent. Each visit is retained for 90 days, then awaits the daily deletion batch.</p>
      </>}
    </section>}
    <section className="rec-sec"><h2>Children and current position</h2>
      {data.children.error ? <p role="alert">Child summaries unavailable. History may still be available below.</p> : <>
        {children.length === 0 && <p className="adm-empty">No children match these filters. A family with no children can still have history.</p>}
        {children.map(c => {
          const delivered = c.books.filter(b => b.delivered).sort((a, b) => b.number - a.number)[0];
          const quiet = inactivity(delivered?.delivered ?? null, c.lastWork, c.zone, now);
          return <article className="adm-card" key={c.id}>
            <h3><Link prefetch={false} href={`/admin/parents/${c.parent}`}>{c.family}</Link>: {c.name}<TestTag test={c.test} /></h3>
            <p>Plan: {c.plan ? title(c.plan) : "Not recorded"}. Assessment: {c.assessment ? <Link prefetch={false} href={`/admin/assessments/${c.assessment.id}`}>{title(c.assessment.status)}</Link> : "Not started"}.</p>
            <p>Last meaningful work: {c.lastWork ? familyWhen(Date.parse(c.lastWork), c.zone) : "Not recorded"}. Latest recorded family visit: {c.lastVisit ? familyWhen(Date.parse(c.lastVisit), c.zone) : "Not recorded"}.</p>
            {quiet.state === "due" && <p role="status">Needs attention: no qualifying work recorded for four local days since confirmed delivery or later meaningful work. Check the book state before contacting the family. Paper work may exist without a scan.</p>}
            {quiet.state === "unknown" && <p>Inactivity cannot be determined without confirmed delivery.</p>}
            {c.assessment && c.assessment.status !== "completed" && <p>Assessment has no completion recorded{Date.parse(c.assessment.resumeUntil) < now ? "; its resume time has passed" : ""}.</p>}
            <p>Maya in the period: {c.maya.sessions} session records; {c.maya.ended} ended; {c.maya.withWork} with child participation. Recorded outcomes: {c.maya.solved} solved, {c.maya.technical} technical issues, {c.maya.noOutcome} unavailable. Connected duration: {c.maya.seconds === null ? "Not recorded" : `${Math.round(c.maya.seconds)} seconds`}{c.maya.unknownDuration > 0 ? `; ${c.maya.unknownDuration} records have no duration` : ""}. <Link prefetch={false} href={`/admin/maya?child=${c.id}`}>Session outcomes</Link>.</p>
            <Table label={`${c.name}: current and prior books`} head={["Book", "Current state", "Actual delivery", "Observed scan receipts", "Details"]} empty="No book records.">
              {c.books.slice(0, 20).map((b, i) => <tr key={b.id}><td>Book {b.number}{i === 0 ? " (latest)" : ""}</td><td>{title(b.status)}</td><td>{b.delivered ? familyWhen(Date.parse(b.delivered), c.zone) : "Not confirmed"}<p>First accepted scan: {b.firstScan ? familyWhen(Date.parse(b.firstScan), c.zone) : "Not recorded"}</p></td>
                <td>{b.contractAvailable ? `${b.scannedPages} pages; ${b.receipts} accepted receipts` : "Print evidence unavailable"}{b.contractAvailable && b.receipts > b.scannedPages ? "; repeat receipts recorded" : ""}{b.repeatPhotos > 0 ? `; ${b.repeatPhotos} repeat page photos` : ""}</td>
                <td><Link prefetch={false} href={href({ family: c.parent, child: c.id, book: b.id, after: null, childrenAfter: null })}>Days and history</Link> · <Link prefetch={false} href={`/admin/workbooks/${b.id}`}>Original book</Link></td></tr>)}
            </Table>
            {c.books.length > 20 && <p>Only the latest 20 books are shown. Earlier workbook actions remain in the paged history.</p>}
          </article>;
        })}
        {(data.children.data?.length ?? 0) > 25 && <Link prefetch={false} className="btn ghost adm-btn" href={href({ childrenAfter: children.at(-1)!.id })}>More children</Link>}
      </>}
    </section>
    {f.book && <section className="rec-sec"><h2>Selected book: observed completion</h2>
      {!book || !summary ? <p role="alert">Book progress unavailable. Select a family, child and book together. Legacy books may have no frozen print contract.</p> : <>
        <p>{summary.scannedDays} of {summary.days.length} days scanned; {summary.markedDays ?? "Unknown"} days fully marked. {summary.scannedPages} of {summary.requiredPages} required pages scanned; {summary.markedPages ?? "Unknown"} fully marked. These counts describe stored results. Review readiness follows those results. Human review completion has no separate record. Paper completion is not recorded.</p>
        {book.canonicalPages ? <p>{book.canonicalPages.filter(p => p.status === "review").length} pages await the team. {book.canonicalPages.filter(p => p.failedJob && !["ready", "blank", "unscored"].includes(p.status)).length} pages have a recorded technical failure. A later completed page clears its earlier failed job from this count.</p> : <p role="alert">Marking, team and technical status are unavailable because the history read was incomplete.</p>}
        <Table label="Selected book by printed day" head={["Day", "Scanned pages", "Fully marked pages", "Current state", "Original results"]} empty="No required printed days.">
          {summary.days.map(d => <tr key={d.day}><td>Day {d.day}</td><td>{d.scanned} / {d.required}</td><td>{d.marked === null ? "Unavailable" : `${d.marked} / ${d.required}`}</td><td>{d.state}{d.team ? `; ${d.team} await team` : ""}{d.failed ? `; ${d.failed} could not be marked` : ""}</td><td><Link prefetch={false} href={`/admin/scans?child=${f.child}&workbook=${f.book}`}>Page results</Link></td></tr>)}
        </Table>
      </>}
    </section>}
    <section className="rec-sec"><h2>Family history</h2>
      {data.history.error ? <p role="alert">History unavailable. No empty history is claimed. <Link prefetch={false} href={href({})}>Try this read again</Link>.</p> : <>
        <Table label="Customer activity history" head={["Time (UTC)", "Family / child", "Activity", "Actor", "Record"]} empty="No retained events match these filters.">
          {history.map(r => <tr key={r.key}><td>{at(r.at)}</td><td><Link prefetch={false} href={`/admin/parents/${r.parent}`}>{r.familyName}</Link>{r.childName && ` / ${r.childName}`}<TestTag test={r.test} /></td><td>{r.label}{r.note && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.note}</p>}</td><td>{r.actorName ?? (r.actor === "unknown" ? "Not recorded" : title(r.actor))}</td><td><Link prefetch={false} href={r.href}>Open record</Link></td></tr>)}
        </Table>
        {(data.history.data?.length ?? 0) > 50 && <Link prefetch={false} className="btn ghost adm-btn" href={href({ after: `${history.at(-1)!.at}|${history.at(-1)!.key}` })}>Older activity</Link>}
      </>}
      <p className="adm-note">Retained product records can predate optional tracking. Historical plan actor identity is unavailable when the source did not save it. An opened scanner and a later accepted photo remain separate events.</p>
    </section>
    {f.parent && <CustomerContactNote parent={f.parent} people={children.map(c => ({ id: c.id, name: c.name }))} />}
  </div>;
}
