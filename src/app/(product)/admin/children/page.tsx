import Link from "next/link";
import { LIST_MAX, listChildren, requireAdmin } from "@/lib/admin-store";
import { adminParentPath, listOffset, parseFilters, when } from "@/lib/admin-view";
import { loadTestFamilies } from "@/lib/admin-test-families-server";
import { pageMetadata } from "@/lib/metadata";
import { FilterForm, More, Table, TestTag, gradeAndPlace } from "@/components/admin";
import { AdminFrame } from "@/components/admin-frame";
import { childPath } from "@/components/admin-records";

export const metadata = pageMetadata({ path: "/admin/children", title: "Admin: children", description: "Admin area.", index: false });

// Every child, newest first. Not in the sidebar: it lives under Families (D-313). Test families follow the "Show test
// families" switch.
export default async function ChildrenPage({ searchParams }: PageProps<"/admin/children">) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const filters = parseFilters(query);
  const offset = listOffset(query, LIST_MAX);
  const view = await loadTestFamilies(admin);
  const { rows, more } = await listChildren(admin, filters, offset, view.hidden);
  return <AdminFrame email={admin.email} title="Every child" lead="Every child, newest first, with their family and tests." testNote={view.show}
    actions={<Link className="btn ghost adm-btn" href="/admin/parents" prefetch={false}>Families</Link>}>
    <FilterForm action="/admin/children" filters={filters} fields={["grade", "province"]} />
    <Table label="Children" head={["Child", "Family", "Tests", "Last test (Pacific)", "Added (Pacific)"]} empty="No children match.">
      {rows.map((c) => <tr key={c.id}>
        <td><Link href={childPath(c.id)} prefetch={false}><b>{c.first_name}</b></Link><TestTag test={view.show && view.isTest(c.parent_id)} /><span className="adm-sub">{gradeAndPlace(c.grade, c.province)}</span></td>
        <td><Link href={adminParentPath(c.parent_id)} prefetch={false}>{c.parent?.name ?? "Family"}</Link>{c.parent?.email && <span className="adm-sub">{c.parent.email}</span>}</td>
        <td className="adm-num">{c.tests.total === 0 ? "None" : `${c.tests.completed} of ${c.tests.total} finished`}</td>
        <td className="adm-nowrap">{when(c.tests.lastAt)}</td>
        <td className="adm-nowrap">{when(c.created_at)}</td>
      </tr>)}
    </Table><More more={more} max={LIST_MAX} offset={offset} action="/admin/children" filters={filters} />
  </AdminFrame>;
}
