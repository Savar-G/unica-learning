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
import { Table } from "@/components/admin";
import { AdminFrame } from "@/components/admin-frame";
import { ScanPrivateImages } from "@/components/scan-private-images";

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
  return <AdminFrame email={admin.email} title="Marked page" lead="The photo, the answers our team must mark, and every change to the marks.">
    {result.photoAvailable ? <ScanPrivateImages photo={id} numbers={result.items.map((i) => i.number)} /> : <p>Photo no longer available</p>}
    <h2>Answers for our team to mark</h2>
    <p>The AI was not sure of these answers. Look at the photo, then set the mark. The family sees it at once and can still change it.</p>
    <Table label="Answers for our team to mark" head={["Question", "What the AI read", "Why it is waiting", "Set the mark"]} empty="No answers are waiting for our team on this page.">
      {waiting.map((m) => <tr key={m.expected.identity.itemId}>
        <td>{m.expected.number}</td><td>{m.observation.readAnswerText === null ? "Not read" : m.observation.readAnswerText === "" ? "Empty" : m.observation.readAnswerText}</td>
        <td>{reason(m.observation.issue)}</td>
        <td>{!rowId(m) ? "Reload the page" : needsPhoto(m) ? "This answer has no saved photo, and its mark would count toward progress, so it cannot be marked here. Ask the family to send a new photo of this page."
          : <AdminTeamMark item={rowId(m)!} version={m.observation.resultVersion} number={m.expected.number} />}</td>
      </tr>)}
    </Table>
    <h2>Mark changes</h2>
    <Table label="Mark changes by a parent or our team" head={["Question", "Version", "Change", "Who / server time", "Original reading"]} empty="No changes on this page.">
      {history.map((h) => <tr key={h.id}>
        <td>{h.previous.expected.number}</td><td>{h.from} to {h.to}</td>
        <td>{h.previous.observation.result ?? h.previous.observation.state} to {h.current.result}</td>
        <td>{h.actor === "admin" ? "Our team" : h.actor === "parent" ? "Parent" : h.actor} / {h.at}</td><td>{h.previous.observation.readAnswerText ?? "Not read"}</td>
      </tr>)}
    </Table>
    <p className="adm-row">
      {history.length > 0 && <Link href={`/admin/scans/${id}?after=${history[history.length - 1].id}`}>More changes</Link>}
      {Number(after) > 0 && <Link href={`/admin/scans/${id}`}>First changes</Link>}
    </p>
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
