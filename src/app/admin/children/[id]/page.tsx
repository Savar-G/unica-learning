import Link from "next/link";
import { notFound } from "next/navigation";
import { getChild, requireAdmin } from "@/lib/admin-store";
import { adminParentPath, when } from "@/lib/admin-view";
import { bookMix, fromRow, interestLabel, LEARNING_STYLES, styleLabel } from "@/lib/learning-style";
import { AdminFrame, TestsTable, gradeAndPlace } from "@/components/admin";
import { RecordFacts } from "@/components/admin-records";

export default async function ChildPage({ params }: PageProps<"/admin/children/[id]">) {
  const admin = await requireAdmin();
  const record = await getChild(admin, (await params).id);
  if (!record) notFound();
  const { child: c, family } = record;
  // #126: the parent's answers and the book mix they give. A child with no answer gets the default mix.
  const learning = fromRow(c);
  const mix = bookMix(learning);
  return <AdminFrame email={admin.email} section="children" title={c.first_name}>
    <RecordFacts facts={[["Grade and curriculum", gradeAndPlace(c.grade, c.province)], ["Parent", <Link key="parent" href={adminParentPath(c.parent_id)}>{family.parent.name}</Link>], ["Added (Pacific)", when(c.created_at)], ["Child id", c.id]]} />
    <h2>How {c.first_name} learns</h2>
    <RecordFacts facts={[
      ["Learns best from", learning?.styles.length ? learning.styles.map(styleLabel).join("; ") : "No answer"],
      ["Interests", learning?.interests.length ? learning.interests.map(interestLabel).join(", ") : "No answer"],
      ["Parent's note", learning?.note || "-"],
      // A cleared answer keeps its save time, so the date shows only with answers.
      ["Answered (Pacific)", learning && c.learning_updated_at ? when(c.learning_updated_at) : "Not answered"],
      ["Book mix", `${mix.isDefault ? "Default mix: " : ""}${LEARNING_STYLES.map((s) => `${s.label} ${mix.shares[s.id]}%`).join(" · ")}`],
      ["Story problem settings", mix.settings.length ? mix.settings.map(interestLabel).join(", ") : "A mix of everyday settings"],
    ]} />
    <h2>Tests and reports</h2><TestsTable tests={family.tests} family />
  </AdminFrame>;
}
