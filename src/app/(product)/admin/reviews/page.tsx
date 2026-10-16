import Link from "next/link";
import { LIST_MAX, listReviews, requireAdmin } from "@/lib/admin-store";
import { adminTestPath, listOffset, parseFilters, when } from "@/lib/admin-view";
import { AdminFrame, Chip, FilterForm, More, Table } from "@/components/admin";

export default async function ReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const filters = parseFilters(query);
  const offset = listOffset(query, LIST_MAX);
  const { rows, more } = await listReviews(admin, { lowOnly: filters.lowAi }, offset);
  return <AdminFrame email={admin.email} section="reviews" title="AI reviews">
    <FilterForm action="/admin/reviews" filters={filters} fields={["lowAi"]} />
    <p className="adm-note">Low-confidence comments stay out of the parent report. Open a test to see the answer and shown work.</p>
    <Table label="AI reviews" head={["Created (Pacific)", "Child", "Question", "Confidence", "Score", "Kind", "Error type", "Comment", "Model"]} empty="No AI reviews match.">
      {rows.map((r) => <tr key={`${r.assessment_id}/${r.question_id}`}><td className="adm-nowrap">{when(r.created_at)}</td><td><Link href={adminTestPath(r.assessment_id)}>{r.test?.child?.first_name ?? "Test"}</Link></td><td><Link href={`${adminTestPath(r.assessment_id)}#work-${r.question_id}`}>{r.question_id}</Link></td><td><Chip tone={r.confidence === "low" ? "warn" : "ok"}>{r.confidence}</Chip></td><td>{Number(r.score).toFixed(2)}</td><td>{r.kind}</td><td>{r.error_type || "-"}</td><td className="adm-wide">{r.comment || "-"}</td><td>{r.model}</td></tr>)}
    </Table><More more={more} max={LIST_MAX} offset={offset} action="/admin/reviews" filters={filters} />
  </AdminFrame>;
}
