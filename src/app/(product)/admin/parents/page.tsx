import Link from "next/link";
import { AdminFrame, More, Table } from "@/components/admin";
import { StageChip, TestMark } from "@/components/admin-dashboard-parts";
import { ago, since } from "@/lib/admin-dashboard";
import { loadDashboard } from "@/lib/admin-dashboard-load";
import { LIST_MAX } from "@/lib/admin-store";
import { adminParentPath, listOffset, when } from "@/lib/admin-view";

// Every family, newest signup first, with its stage (D-099). Team and test families are listed too, marked Test.
export default async function ParentsPage({ searchParams }: PageProps<"/admin/parents">) {
  const query = await searchParams;
  const { who, d } = await loadDashboard({ ...query, tests: "1" });
  const offset = listOffset(query, LIST_MAX);
  const all = [...d.families].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rows = all.slice(offset, offset + LIST_MAX);
  return <AdminFrame email={who} section="parents" title="Parents">
    {query.deleted === "1" && <p role="status">Family deleted.</p>}
    <Table label="Parents" head={["Joined (Pacific)", "Parent", "Email", "Postal code", "Children", "Tests", "Completed", "Stage", "Last activity"]} empty="No parents.">
      {rows.map((f) => <tr key={f.id}>
        <td className="adm-nowrap">{when(f.createdAt)}</td>
        <td><Link href={adminParentPath(f.id)}>{f.name}</Link><TestMark test={f.test} /></td>
        <td>{f.email}</td><td>{f.postal ?? "-"}</td>
        <td>{f.children.map((c) => `${c.name} (gr ${c.grade}, ${c.province})`).join(", ") || "-"}</td>
        <td className="adm-num">{f.tests.length}</td><td className="adm-num">{f.tests.filter((t) => t.status === "completed").length}</td>
        <td><StageChip stage={f.stage} /><span className="adm-sub">{since(f.stageAt, d.now)}</span></td>
        <td className="adm-nowrap">{ago(f.lastActivityAt, d.now)}</td>
      </tr>)}
    </Table><More more={all.length > offset + LIST_MAX} max={LIST_MAX} offset={offset} action="/admin/parents" />
  </AdminFrame>;
}
