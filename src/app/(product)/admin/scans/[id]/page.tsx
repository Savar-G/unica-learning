import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-store";
import { adminClient } from "@/lib/supabase-auth";
import { markingCommand, scanMarkChanges } from "@/lib/scan-marking-store";
import { readScanMarking } from "@/lib/scan-marking-server";
import { waitsForTeam } from "@/lib/scan-marking";
import { readingIssueText, READING_ISSUES, type ReadingIssue } from "@/lib/scan-observation";
import { AdminTeamMark } from "@/components/admin-team-mark";
import { teamMarkNeedsPhoto } from "@/lib/scan-team-marks";
import { isUuid } from "@/lib/workbook-content";
import { when } from "@/lib/admin-view";
import { Table } from "@/components/admin";
import { AdminFrame } from "@/components/admin-frame";
import { MarkHead, ResultChip, actorText, readText } from "@/components/admin-marking";
import { ScanPrivateImages } from "@/components/scan-private-images";

const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** A result or reading state, in words, for a change. */
const resultText = (r: string | null | undefined) => r === "right" ? "Right" : r === "wrong" ? "Wrong" : r === "blank" ? "Blank" : r === "unscored" ? "Not scored" : "Not marked";

// One marked page (D-313, D-315): the photo large, the answers for our team to mark beside it, every answer's reading as
// a compact list, the mark changes as a timeline, and the raw data in a closed "Technical details" section.
export default async function AdminScanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ after?: string }> }) {
  const admin = await requireAdmin(), { id } = await params;
  if (!isUuid(id)) notFound();
  // Ownership comes from an RLS read with the verified admin session, before the server-only detail read.
  const row = await admin.db.from("scan_photos").select("parent_id").eq("id", id).maybeSingle();
  const db = adminClient();
  if (row.error || !row.data || !db) notFound();
  const result = await readScanMarking(db, row.data.parent_id, id);
  if (!result) notFound();
  const after = (await searchParams).after ?? "0";
  if (!/^\d{1,15}$/.test(after)) notFound();
  const history = await scanMarkChanges(markingCommand(db), row.data.parent_id, id, Number(after));
  const waiting = result.marks.filter(waitsForTeam);
  // The team mark names the item's row. Read the row ids of this page's waiting items with the server key.
  const rows = waiting.length ? await db.from("scan_marking_items").select("id,item_id,workbook_id,page_id,printed_revision,owner_photo").eq("parent_id", row.data.parent_id)
    .in("item_id", waiting.map((m) => m.expected.identity.itemId)) : { data: [], error: null };
  if (rows.error) throw new Error("team_mark_rows");
  const itemRow = (m: (typeof waiting)[number]) => (rows.data ?? []).find((r) => r.item_id === m.expected.identity.itemId && r.workbook_id === m.expected.identity.workbookId
    && r.page_id === m.expected.identity.pageId && r.printed_revision === m.expected.identity.printedRevision);
  const rowId = (m: (typeof waiting)[number]) => itemRow(m)?.id ?? null;
  // One rule with admin_set_scan_mark: no buttons where the mark cannot be saved.
  const needsPhoto = (m: (typeof waiting)[number]) => teamMarkNeedsPhoto({ eligible: m.expected.mastery.eligible, hasEvent: m.originalEvent !== null,
    photo: m.observation.evidence?.photoRevision ?? itemRow(m)?.owner_photo ?? null });
  const reason = (issue: unknown) => typeof issue === "string" && READING_ISSUES.includes(issue as ReadingIssue) ? readingIssueText(issue as ReadingIssue) : "Waiting for a person to mark it.";
  const waitingNumbers = new Set(waiting.map((m) => m.expected.number));
  const otherNumbers = result.items.map((i) => i.number).filter((n) => !waitingNumbers.has(n));
  return <AdminFrame email={admin.email} title="Marked page" lead="The photo, the answers our team must mark, and every change to the marks."
    actions={<Link className="btn adm-btn ghost" href="/admin/scans">All marking</Link>}>
    <div className="adm-mk-page">
      <section className="adm-mk-photo" aria-label="The scanned page">
        {result.photoAvailable ? <ScanPrivateImages photo={id} numbers={[]} /> : <p className="adm-mk-empty">Photo no longer available</p>}
      </section>
      <section className="adm-mk-side" aria-labelledby="mk-mark">
        <MarkHead id="mk-mark" title="Answers for our team to mark" count={waiting.length}>The AI was not sure of these answers. Look at the photo, then set the mark. The family sees it at once and can still change it.</MarkHead>
        {waiting.length === 0 ? <p className="adm-mk-empty">No answers are waiting for our team on this page.</p>
          : <ul className="adm-mk-marks">{waiting.map((m) => <li key={m.expected.identity.itemId}>
            {result.photoAvailable && <ScanPrivateImages photo={id} numbers={[m.expected.number]} cropsOnly />}
            <div className="adm-mk-mark-text">
              <b>Question {m.expected.number}</b>
              <span>The AI read <q>{readText(m.observation.readAnswerText)}</q></span>
              <span className="adm-mk-why">{reason(m.observation.issue)}</span>
            </div>
            <div className="adm-mk-mark-act">{!rowId(m) ? <p className="adm-note">Reload the page</p> : needsPhoto(m) ? <p className="adm-note">This answer has no saved photo, and its mark would count toward progress, so it cannot be marked here. Ask the family to send a new photo of this page.</p>
              : <AdminTeamMark item={rowId(m)!} version={m.observation.resultVersion} number={m.expected.number} />}</div>
          </li>)}</ul>}
      </section>
    </div>
    <section className="adm-mk" aria-labelledby="mk-items">
      <MarkHead id="mk-items" title="Every answer on this page" count={result.items.length}>What the AI read and the mark now. Times are Pacific.</MarkHead>
      {result.items.length === 0 ? <p className="adm-mk-empty">No readings yet.</p>
        : <ul className="adm-mk-items">{result.items.map((i) => <li key={i.itemId}>
          <b>Q{i.number}</b>
          <span className="adm-mk-read">{readText(i.readAnswerText)}</span>
          <ResultChip result={i.result} waiting={i.result === null && waitingNumbers.has(i.number)} label={i.result ? resultText(i.result) : i.state === "unscored" ? "Not scored" : waitingNumbers.has(i.number) ? "Our team is checking" : "Not marked yet"} />
          <span className="adm-mk-by">{actorText(i.actor)} · {when(i.at)}</span>
        </li>)}</ul>}
      {result.photoAvailable && otherNumbers.length > 0 && <details className="adm-mk-crops">
        <summary>Pictures of the other {pl(otherNumbers.length, "answer", "answers")}</summary>
        <ScanPrivateImages photo={id} numbers={otherNumbers} cropsOnly />
      </details>}
    </section>
    <section className="adm-mk" aria-labelledby="mk-changes">
      <MarkHead id="mk-changes" title="Mark changes" count={history.length}>Each change by a parent or our team, oldest first. Times are Pacific.</MarkHead>
      {history.length === 0 ? <p className="adm-mk-empty">No changes on this page.</p>
        : <ol className="adm-mk-timeline" aria-label="Mark changes by a parent or our team">{history.map((h) => <li key={h.id}>
          <span className="adm-mk-dot" aria-hidden="true" />
          <div>
            <p><b>Question {h.previous.expected.number}</b>: {resultText(h.previous.observation.result ?? h.previous.observation.state)} to {resultText(h.current.result)}</p>
            <p className="adm-mk-by">{actorText(h.actor)} · {when(h.at)} · version {h.from} to {h.to} · the AI read <q>{h.previous.observation.readAnswerText ?? "Not read"}</q></p>
          </div>
        </li>)}</ol>}
      <p className="adm-row">
        {history.length > 0 && <Link href={`/admin/scans/${id}?after=${history[history.length - 1].id}`}>More changes</Link>}
        {Number(after) > 0 && <Link href={`/admin/scans/${id}`}>First changes</Link>}
      </p>
    </section>
    <details className="adm-tech">
      <summary>Technical details</summary>
      <Table label="What the AI read and the result of each question" head={["Question", "What the AI read", "Result", "By / time", "Counts toward progress", "Learning event"]} empty="No readings yet.">
        {result.marks.map((m) => <tr key={m.expected.identity.itemId}>
          <td>{m.expected.number}</td><td>{m.observation.readAnswerText ?? "Not read"}</td>
          <td>{m.observation.result ?? m.observation.state} (version {m.observation.resultVersion})</td>
          <td>{m.observation.actor} / {m.at}</td>
          <td>{m.expected.mastery.eligible ? "Yes" : m.expected.mastery.reason}</td>
          <td>{m.eventId ? <Link href={`/admin/scans/${id}#event-${m.eventId}`}>{m.eventId}</Link> : "None"}</td>
        </tr>)}
      </Table>
      <h3>Marking job and its cost</h3>
      <pre>{JSON.stringify(result.detail, null, 2)}</pre>
      {result.marks.filter((m) => m.eventId).map((m) => <div key={m.eventId} id={`event-${m.eventId}`}><h3>Learning event for question {m.expected.number}</h3><pre>{JSON.stringify(m.originalEvent, null, 2)}</pre></div>)}
    </details>
  </AdminFrame>;
}
