import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-store";
import { adminClient } from "@/lib/supabase-auth";
import { readScanMarking } from "@/lib/scan-marking-server";
import { isUuid } from "@/lib/workbook-content";
import { AdminFrame, Table } from "@/components/admin";
import { ScanPrivateImages } from "@/components/scan-private-images";

export default async function AdminScanPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(), { id } = await params;
  if (!isUuid(id)) notFound();
  // Ownership comes from an RLS read with the verified admin session, before the server-only detail read.
  const row = await admin.db.from("scan_photos").select("parent_id").eq("id", id).maybeSingle();
  const db = adminClient();
  if (row.error || !row.data || !db) notFound();
  const result = await readScanMarking(db, row.data.parent_id, id);
  if (!result) notFound();
  return <AdminFrame email={admin.email} section="workbooks" title="Scan detail">
    {result.photoAvailable ? <ScanPrivateImages photo={id} numbers={result.items.map((i) => i.number)} /> : <p>Photo no longer available</p>}
    <Table label="Item readings and effective results" head={["Question", "AI reading", "Result", "Eligibility", "Event"]} empty="No readings yet.">
      {result.marks.map((m) => <tr key={m.expected.identity.itemId}>
        <td>{m.expected.number}</td><td>{m.observation.readAnswerText ?? "Not read"}</td>
        <td>{m.observation.result ?? m.observation.state} (version {m.observation.resultVersion})</td>
        <td>{m.expected.mastery.eligible ? "Eligible" : m.expected.mastery.reason}</td>
        <td>{m.eventId ? <Link href={`/admin/scans/${id}#event-${m.eventId}`}>{m.eventId}</Link> : "No event"}</td>
      </tr>)}
    </Table>
    <details><summary>Job state and cost</summary><pre>{JSON.stringify(result.detail, null, 2)}</pre></details>
    {result.marks.filter((m) => m.eventId).map((m) => <details key={m.eventId} id={`event-${m.eventId}`}><summary>Original event for question {m.expected.number}</summary><pre>{JSON.stringify(m.originalEvent, null, 2)}</pre></details>)}
  </AdminFrame>;
}
