import Link from "next/link";
import { AdminFrame } from "@/components/admin-frame";
import { FamiliesBoard, FamiliesList, FamiliesToolbar, StageFilter } from "@/components/admin-families";
import { buildBoard, familiesHref, familyMatches, needsByFamily, pickStageFilter } from "@/lib/admin-families-board";
import { loadDashboard } from "@/lib/admin-dashboard-load";
import { LIST_MAX } from "@/lib/admin-store";
import { listOffset } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";

const PATH = "/admin/parents";
export const metadata = pageMetadata({ path: PATH, title: "Admin: families", description: "Admin area.", index: false });

// Families (D-313, D-315): a board of every family by how far it got, or the same families as a list (?view=list,
// narrowed by ?stage=). Both come from the dashboard's one load: the same families, stages and Needs you rules. Team and
// test families follow the "Show test families" switch: left out, or shown and tagged and never counted. ?q= finds a
// family by the parent's name or email or a child's name (the sidebar's "Find a family or child").
export default async function ParentsPage({ searchParams }: PageProps<"/admin/parents">) {
  const query = await searchParams;
  const { who, d, progress } = await loadDashboard(query);
  const view = query.view === "list" ? "list" : "board";
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const found = d.families.filter((f) => familyMatches(f, q));
  // The search count: real families only (test families are listed while the switch is on, never counted).
  const matches = found.filter((f) => !f.test).length;
  const board = buildBoard(found, { needs: needsByFamily(d), progress, now: d.now });

  const stage = view === "list" ? pickStageFilter(query.stage) : null;
  const offset = listOffset(query, LIST_MAX);
  const listed = found.filter((f) => !stage || stage.stages.includes(f.stage)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rows = listed.slice(offset, offset + LIST_MAX);
  const page = Math.floor(offset / LIST_MAX) + 1;
  const pager = listed.length > LIST_MAX && <nav className="adm-row" aria-label="List pages">
    <span className="adm-note">Page {page}. Up to {LIST_MAX} families per page.</span>
    {page > 1 && <Link href={familiesHref(PATH, query, { page: String(page - 1) })} prefetch={false}>Newer</Link>}
    {listed.length > offset + LIST_MAX && <Link href={familiesHref(PATH, query, { page: String(page + 1) })} prefetch={false}>Older</Link>}
  </nav>;

  return <AdminFrame email={who} title="Families" lead="Every family, by how far they got." testNote={d.tests.shown}
    actions={<Link className="btn ghost adm-btn" href="/admin/children" prefetch={false}>Every child</Link>}>
    {query.deleted === "1" && <p className="fam-flash" role="status">Family deleted.</p>}
    {d.stripeNote && <p className="adm-note">{d.stripeNote}</p>}
    <FamiliesToolbar path={PATH} query={query} view={view} />
    {q && <p className="adm-row fam-found" role="status">
      <span>{found.length === 0 ? `No family matches "${q}".` : matches === 0 ? `Only test families match "${q}".` : `${matches} ${matches === 1 ? "family matches" : "families match"} "${q}".`}</span>
      <Link href={familiesHref(PATH, query, { q: null, page: null })} prefetch={false}>Show every family</Link>
    </p>}
    {view === "board"
      ? <FamiliesBoard board={board} path={PATH} query={query} />
      : <>
        <StageFilter board={board} path={PATH} query={query} current={stage?.key ?? null} />
        <FamiliesList rows={rows} now={d.now} pager={pager} empty={stage ? `No families in ${stage.label}.` : q ? "No family matches." : "No families."} />
      </>}
  </AdminFrame>;
}
