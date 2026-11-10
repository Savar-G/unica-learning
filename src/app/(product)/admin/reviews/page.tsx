import Link from "next/link";
import { LIST_MAX, listReviews, requireAdmin, type AdminSession } from "@/lib/admin-store";
import { adminTestPath, listOffset, parseFilters, when } from "@/lib/admin-view";
import { loadTestFamilies } from "@/lib/admin-test-families-server";
import { notIn } from "@/lib/admin-test-families";
import { REVIEW_KIND_TEXT, reviewSummary } from "@/lib/admin-pages";
import { modelName } from "@/lib/maya-flag-text";
import { pageMetadata } from "@/lib/metadata";
import { Chip, FilterForm, More, Table, TestTag } from "@/components/admin";
import { BarList, SectionHead, Tiles } from "@/components/admin-blocks";
import { AdminFrame } from "@/components/admin-frame";
import "@/components/admin-pages.css";

export const metadata = pageMetadata({ path: "/admin/reviews", title: "Admin: AI reviews", description: "Admin area.", index: false });

/** How many reviews there are, how many the AI was not sure of, and how many of each kind: four counts, no rows. */
async function reviewCounts(a: AdminSession, leaveOut: readonly string[]) {
  const out = notIn(leaveOut);
  const count = async (narrow: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const { count: n, error } = await narrow(base());
    if (error) throw new Error(`[admin] review counts: ${error.message}`);
    return n ?? 0;
  };
  function base() {
    const q = a.db.from("work_reviews").select("id", { count: "exact", head: true });
    return out ? q.not("parent_id", "in", out) : q;
  }
  const [total, low, slip, misunderstanding] = await Promise.all([
    count((q) => q), count((q) => q.eq("confidence", "low")), count((q) => q.eq("kind", "slip")), count((q) => q.eq("kind", "misunderstanding")),
  ]);
  return reviewSummary({ total, low, slip, misunderstanding });
}

// How the AI marked shown work, and how sure it was: the counts first, then the reviews. Test families follow the "Show
// test families" switch (D-313) in the list; the counts are of the real families only.
export default async function ReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const filters = parseFilters(query);
  const offset = listOffset(query, LIST_MAX);
  const view = await loadTestFamilies(admin);
  const [{ rows, more }, summary] = await Promise.all([listReviews(admin, { lowOnly: filters.lowAi }, offset, view.hidden), reviewCounts(admin, view.ids)]);
  const kind = (k: string) => REVIEW_KIND_TEXT[k as keyof typeof REVIEW_KIND_TEXT] ?? k;
  return <AdminFrame email={admin.email} title="AI reviews" lead="How the AI marked shown work, and how sure it was." testNote={view.show}>
    <div className="ap-split">
      <Tiles label="AI reviews" tiles={[
        { key: "total", label: "Reviews", value: summary.total.toLocaleString("en-CA"), sub: "Pieces of shown work, real families" },
        { key: "low", label: "Low confidence", value: summary.low.toLocaleString("en-CA"), sub: "Kept out of the parent report", tone: summary.low ? "warn" : null },
      ]} />
      <section className="ap-card" aria-labelledby="ap-review-kinds">
        <SectionHead id="ap-review-kinds" title="By kind of mistake" />
        <BarList label="Reviews by kind of mistake" max={summary.total} bars={summary.kinds.map((k) => ({ key: k.kind, label: k.label, value: k.n, tone: k.kind === "none" ? "ok" : k.kind === "misunderstanding" ? "bad" : "warn" }))} />
      </section>
    </div>
    <SectionHead id="ap-review-list" title="Every review" line="Newest first. Low-confidence comments stay out of the parent report. Open a test to see the answer and the shown work." />
    <FilterForm action="/admin/reviews" filters={filters} fields={["lowAi"]} />
    <Table label="AI reviews" head={["Created (Pacific)", "Child and question", "Confidence", "Kind", "Comment"]} empty="No AI reviews match.">
      {rows.map((r) => <tr key={`${r.assessment_id}/${r.question_id}`} className={r.confidence === "low" ? "is-wrong" : undefined}>
        <td className="adm-nowrap">{when(r.created_at)}</td>
        <td><Link href={adminTestPath(r.assessment_id)}>{r.test?.child?.first_name ?? "Test"}</Link><TestTag test={view.show && view.isTest(r.test?.parentId)} /><span className="adm-sub">Question <Link href={`${adminTestPath(r.assessment_id)}#work-${r.question_id}`}>{r.question_id}</Link></span></td>
        <td className="adm-nowrap"><Chip tone={r.confidence === "low" ? "warn" : "ok"}>{r.confidence === "low" ? "Low" : "Sure"}</Chip><span className="adm-sub">Score {Number(r.score).toFixed(2)}</span></td>
        <td>{kind(r.kind)}{r.error_type && r.error_type !== "none" && <span className="adm-sub">{r.error_type}</span>}</td>
        <td className="adm-wide">{r.comment || "-"}<span className="adm-sub">Reviewed by {modelName({ id: r.model, fake: r.model === "fake" })}</span></td>
      </tr>)}
    </Table><More more={more} max={LIST_MAX} offset={offset} action="/admin/reviews" filters={filters} />
  </AdminFrame>;
}
