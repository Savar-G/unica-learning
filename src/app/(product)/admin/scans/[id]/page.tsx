import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-store";
import { adminClient } from "@/lib/supabase-auth";
import { markingCommand, scanMarkChanges } from "@/lib/scan-marking-store";
import { readScanMarking } from "@/lib/scan-marking-server";
import { waitsForTeam } from "@/lib/scan-marking";
import { readingIssueText, READING_ISSUES, type ReadingIssue } from "@/lib/scan-observation";
import { AdminTeamMark } from "@/components/admin-team-mark";
import { isUuid } from "@/lib/workbook-content";
import { AdminFrame, Table } from "@/components/admin";
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
  const rows = waiting.length ? await db.from("scan_marking_items").select("id,item_id,workbook_id,page_id,printed_revision").eq("parent_id", row.data.parent_id)
    .in("item_id", waiting.map((m) => m.expected.identity.itemId)) : { data: [], error: null };
  if (rows.error) throw new Error("team_mark_rows");
  const rowId = (m: (typeof waiting)[number]) => (rows.data ?? []).find((r) => r.item_id === m.expected.identity.itemId && r.workbook_id === m.expected.identity.workbookId
    && r.page_id === m.expected.identity.pageId && r.printed_revision === m.expected.identity.printedRevision)?.id ?? null;
  const reason = (issue: unknown) => typeof issue === "string" && READING_ISSUES.includes(issue as ReadingIssue) ? readingIssueText(issue as ReadingIssue) : "Waiting for a person to mark it.";
  return <AdminFrame email={admin.email} section="workbooks" title="Scan detail">
    {result.photoAvailable ? <ScanPrivateImages photo={id} numbers={result.items.map((i) => i.number)} /> : <p>Photo no longer available</p>}
    <h2>Answers for our team to mark</h2>
    <p>The AI was not sure of these answers. Look at the photo, then set the mark. The family sees it at once and can still change it.</p>
    <Table label="Answers for our team to mark" head={["Question", "What the AI read", "Why it is waiting", "Set the mark"]} empty="No answers are waiting for our team on this page.">
      {waiting.map((m) => <tr key={m.expected.identity.itemId}>
        <td>{m.expected.number}</td><td>{m.observation.readAnswerText === null ? "Not read" : m.observation.readAnswerText === "" ? "Empty" : m.observation.readAnswerText}</td>
        <td>{reason(m.observation.issue)}</td>
        <td>{rowId(m) ? <AdminTeamMark item={rowId(m)!} version={m.observation.resultVersion} number={m.expected.number} /> : "Reload the page"}</td>
      </tr>)}
    </Table>
    <Table label="Item readings and effective results" head={["Question", "AI reading", "Result", "Actor / time", "Eligibility", "Event"]} empty="No readings yet.">
      {result.marks.map((m) => <tr key={m.expected.identity.itemId}>
        <td>{m.expected.number}</td><td>{m.observation.readAnswerText ?? "Not read"}</td>
        <td>{m.observation.result ?? m.observation.state} (version {m.observation.resultVersion})</td>
        <td>{m.observation.actor} / {m.at}</td>
        <td>{m.expected.mastery.eligible ? "Eligible" : m.expected.mastery.reason}</td>
        <td>{m.eventId ? <Link href={`/admin/scans/${id}#event-${m.eventId}`}>{m.eventId}</Link> : "No event"}</td>
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
    {history.length > 0 && <Link href={`/admin/scans/${id}?after=${history[history.length - 1].id}`}>More changes</Link>}
    {Number(after) > 0 && <Link href={`/admin/scans/${id}`}>First changes</Link>}
    <details><summary>Job state and cost</summary><pre>{JSON.stringify(result.detail, null, 2)}</pre></details>
    {result.marks.filter((m) => m.eventId).map((m) => <details key={m.eventId} id={`event-${m.eventId}`}><summary>Original event for question {m.expected.number}</summary><pre>{JSON.stringify(m.originalEvent, null, 2)}</pre></details>)}
  </AdminFrame>;
}
