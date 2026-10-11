import Link from "next/link";
import { LIST_MAX, listParents, requireAdmin } from "@/lib/admin-store";
import { adminParentPath, listOffset, when } from "@/lib/admin-view";
import { AdminFrame, More, Table } from "@/components/admin";

export default async function ParentsPage({ searchParams }: PageProps<"/admin/parents">) {
  const admin = await requireAdmin();
  const offset = listOffset(await searchParams, LIST_MAX);
  const { rows, more } = await listParents(admin, offset);
  return <AdminFrame email={admin.email} section="parents" title="Parents">
    <Table label="Parents" head={["Joined (Pacific)", "Parent", "Email", "Postal code", "Children", "Tests", "Completed"]} empty="No parents.">
      {rows.map((p) => <tr key={p.id}><td className="adm-nowrap">{when(p.created_at)}</td><td><Link href={adminParentPath(p.id)}>{p.name}</Link></td><td>{p.email}</td><td>{p.postal}</td><td>{p.children.length}</td><td>{p.tests.total}</td><td>{p.tests.completed}</td></tr>)}
    </Table><More more={more} max={LIST_MAX} offset={offset} action="/admin/parents" />
  </AdminFrame>;
}
