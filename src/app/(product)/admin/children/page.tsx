import Link from "next/link";
import { LIST_MAX, listChildren, requireAdmin } from "@/lib/admin-store";
import { adminParentPath, listOffset, parseFilters, when } from "@/lib/admin-view";
import { AdminFrame, FilterForm, More, Table, gradeAndPlace } from "@/components/admin";
import { childPath } from "@/components/admin-records";

export default async function ChildrenPage({ searchParams }: PageProps<"/admin/children">) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const filters = parseFilters(query);
  const offset = listOffset(query, LIST_MAX);
  const { rows, more } = await listChildren(admin, filters, offset);
  return <AdminFrame email={admin.email} section="children" title="Children">
    <FilterForm action="/admin/children" filters={filters} fields={["grade", "province"]} />
    <Table label="Children" head={["Child", "Grade and curriculum", "Parent", "Tests", "Completed", "Last test (Pacific)"]} empty="No children match.">
      {rows.map((c) => <tr key={c.id}><td><Link href={childPath(c.id)}>{c.first_name}</Link></td><td>{gradeAndPlace(c.grade, c.province)}</td><td><Link href={adminParentPath(c.parent_id)}>{c.parent?.name ?? "Family"}</Link></td><td>{c.tests.total}</td><td>{c.tests.completed}</td><td className="adm-nowrap">{when(c.tests.lastAt)}</td></tr>)}
    </Table><More more={more} max={LIST_MAX} offset={offset} action="/admin/children" filters={filters} />
  </AdminFrame>;
}
