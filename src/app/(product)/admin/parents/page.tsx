import Link from "next/link";
import { More, Table } from "@/components/admin";
import { AdminFrame } from "@/components/admin-frame";
import { StageChip, TestMark } from "@/components/admin-dashboard-parts";
import { ago, kidsText, since } from "@/lib/admin-dashboard";
import { loadDashboard } from "@/lib/admin-dashboard-load";
import { LIST_MAX } from "@/lib/admin-store";
import { gradeShort } from "@/lib/assessment/grades";
import { adminParentPath, listOffset, when } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";

const PATH = "/admin/parents";
export const metadata = pageMetadata({ path: PATH, title: "Admin: families", description: "Admin area.", index: false });

// Every family, newest signup first, with its stage (D-099). Team and test families follow the "Show test families"
// switch (D-313): left out, or listed and tagged. ?q= finds a family by the parent's name or email or a child's name
// (the sidebar's "Find a family or child").
export default async function ParentsPage({ searchParams }: PageProps<"/admin/parents">) {
  const query = await searchParams;
  const { who, d } = await loadDashboard(query);
  const offset = listOffset(query, LIST_MAX);
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const words = q.toLowerCase();
  const all = [...d.families]
    .filter((f) => !words || `${f.name} ${f.email} ${kidsText(f)}`.toLowerCase().includes(words))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rows = all.slice(offset, offset + LIST_MAX);
  return <AdminFrame email={who} title="Families" lead="Every parent and their children, newest first, with the stage each family reached." testNote={d.tests.shown}
    actions={<Link className="btn ghost adm-btn" href="/admin/children" prefetch={false}>Every child</Link>}>
    {query.deleted === "1" && <p role="status">Family deleted.</p>}
    {q && <p className="adm-row" role="status">
      <span>{all.length === 0 ? `No family matches "${q}".` : `${all.length} ${all.length === 1 ? "family matches" : "families match"} "${q}".`}</span>
      <Link href={PATH} prefetch={false}>Show every family</Link>
    </p>}
    <Table label="Families" head={["Joined (Pacific)", "Parent", "Email", "Postal code", "Children", "Tests", "Completed", "Stage", "Last activity"]} empty={q ? "No family matches." : "No families."}>
      {rows.map((f) => <tr key={f.id}>
        <td className="adm-nowrap">{when(f.createdAt)}</td>
        <td><Link href={adminParentPath(f.id)}>{f.name}</Link><TestMark test={f.test} /></td>
        <td>{f.email}</td><td>{f.postal ?? "-"}</td>
        <td>{f.children.map((c) => `${c.name} (gr ${gradeShort(c.grade)}, ${c.province})`).join(", ") || "-"}</td>
        <td className="adm-num">{f.tests.length}</td><td className="adm-num">{f.tests.filter((t) => t.status === "completed").length}</td>
        <td><StageChip stage={f.stage} /><span className="adm-sub">{since(f.stageAt, d.now)}</span></td>
        <td className="adm-nowrap">{ago(f.lastActivityAt, d.now)}</td>
      </tr>)}
    </Table><More more={all.length > offset + LIST_MAX} max={LIST_MAX} offset={offset} action={PATH} />
  </AdminFrame>;
}
