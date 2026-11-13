import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminFrame } from "@/components/admin-frame";
import { AdminSnapshotPlan } from "@/components/admin-snapshot-plan";
import { getChild, requireAdmin } from "@/lib/admin-store";
import { snapshotPlanView } from "@/lib/next-book-plan-view";
import { snapshotRecord } from "@/lib/next-book-snapshot-store";

// #473 (S10b): the plan the next-book snapshot froze (#476), per skill. It reads the child's latest snapshot row with the
// admin's session and writes nothing.
export default async function SnapshotPlanPage({ params }: PageProps<"/admin/children/[id]/snapshot-plan">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const record = await getChild(admin, id);
  if (!record) notFound();
  const { data, error } = await admin.db.from("next_book_snapshots").select("*").eq("child_id", id).eq("parent_id", record.child.parent_id)
    .order("created_at", { ascending: false }).order("revision", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Next book snapshot: ${error.message}`);
  const view = snapshotPlanView(data ? snapshotRecord(data) : null);
  return <AdminFrame email={admin.email} title={`Snapshot plan for ${record.child.first_name}`}>
    <p><Link href={`/admin/children/${id}`}>Back to the child</Link></p>
    <p>The plan for the next book, from the marks the latest snapshot froze. It shows each skill&apos;s next steps, reviews, Fix it items and the marks kept for later. Nothing here changes the snapshot.</p>
    <AdminSnapshotPlan view={view} />
  </AdminFrame>;
}
