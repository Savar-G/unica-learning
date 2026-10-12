import { notFound } from "next/navigation";
import { getParent, requireAdmin } from "@/lib/admin-store";
import { when } from "@/lib/admin-view";
import { AdminFrame } from "@/components/admin";
import { FamilyRecords, RecordFacts } from "@/components/admin-records";
import { DeleteFamily } from "@/components/delete-family";

export default async function ParentPage({ params }: PageProps<"/admin/parents/[id]">) {
  const admin = await requireAdmin();
  const family = await getParent(admin, (await params).id);
  if (!family) notFound();
  const p = family.parent;
  return <AdminFrame email={admin.email} section="parents" title={p.name}>
    <RecordFacts facts={[["Email", p.email], ["Postal code", p.postal], ["Joined (Pacific)", when(p.created_at)], ["Parent id", p.id], ["Source", Object.entries(p.source).map(([k, v]) => `${k}: ${v}`).join(", ") || "-"]]} />
    <FamilyRecords family={family} />
    <DeleteFamily parentId={p.id} email={p.email} />
  </AdminFrame>;
}
