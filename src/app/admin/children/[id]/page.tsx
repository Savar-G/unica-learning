import Link from "next/link";
import { notFound } from "next/navigation";
import { getChild, requireAdmin } from "@/lib/admin-store";
import { adminParentPath, when } from "@/lib/admin-view";
import { AdminFrame, TestsTable, gradeAndPlace } from "@/components/admin";
import { RecordFacts } from "@/components/admin-records";

export default async function ChildPage({ params }: PageProps<"/admin/children/[id]">) {
  const admin = await requireAdmin();
  const record = await getChild(admin, (await params).id);
  if (!record) notFound();
  const { child: c, family } = record;
  return <AdminFrame email={admin.email} section="children" title={c.first_name}>
    <RecordFacts facts={[["Grade and curriculum", gradeAndPlace(c.grade, c.province)], ["Parent", <Link key="parent" href={adminParentPath(c.parent_id)}>{family.parent.name}</Link>], ["Added (Pacific)", when(c.created_at)], ["Child id", c.id]]} />
    <h2>Tests and reports</h2><TestsTable tests={family.tests} family />
  </AdminFrame>;
}
