import Link from "next/link";
import { notFound } from "next/navigation";
import { getChild, getChildRuns, getChildWorkbooks, requireAdmin } from "@/lib/admin-store";
import { adminChildProfilePath, adminParentPath, adminWorkbookPath, when } from "@/lib/admin-view";
import { answerFacts, bookMix, fromRow, interestLabel, LEARNING_STYLES } from "@/lib/learning-style";
import { AdminFrame, Table, TestsTable, gradeAndPlace } from "@/components/admin";
import { RecordFacts } from "@/components/admin-records";
import { WorkbookStatusChip } from "@/components/admin-workbook";
import { ChildRunsTable } from "@/components/admin-workbook-runs";
import { PrepareWorkbook } from "@/components/prepare-workbook";

export default async function ChildPage({ params }: PageProps<"/admin/children/[id]">) {
  const admin = await requireAdmin();
  const id = (await params).id;
  const [record, workbooks, runs] = await Promise.all([getChild(admin, id), getChildWorkbooks(admin, id), getChildRuns(admin, id)]);
  if (!record) notFound();
  const { child: c, family } = record;
  // #126: the parent's answers and the book mix they give. A child with no answer gets the default mix. #195 (D-107):
  // the feeling about math, the main goal and the time each week; they do not change the mix.
  const learning = fromRow(c);
  const mix = bookMix(learning);
  return <AdminFrame email={admin.email} section="children" title={c.first_name}>
    <RecordFacts facts={[["Grade and curriculum", gradeAndPlace(c.grade, c.province)], ["Parent", <Link key="parent" href={adminParentPath(c.parent_id)}>{family.parent.name}</Link>], ["Added (Pacific)", when(c.created_at)], ["Child id", c.id],
      // #303: the current profile from the latest test profile and every learning event.
      ["Profile", <Link key="profile" href={adminChildProfilePath(c.id)}>Open the child&apos;s profile</Link>]]} />
    <h2>How {c.first_name} learns</h2>
    <RecordFacts facts={[
      ...answerFacts(learning),
      // A cleared answer keeps its save time, so the date shows only with answers.
      ["Answered (Pacific)", learning && c.learning_updated_at ? when(c.learning_updated_at) : "Not answered"],
      ["Book mix", `${mix.isDefault ? "Default mix: " : ""}${LEARNING_STYLES.map((s) => `${s.label} ${mix.shares[s.id]}%`).join(" · ")}`],
      ["Story problem settings", mix.settings.length ? mix.settings.map(interestLabel).join(", ") : "A mix of everyday settings"],
    ]} />
    <h2>Tests and reports</h2><TestsTable tests={family.tests} family />
    {/* #299: each workbook as data, newest first. */}
    <h2>Workbooks</h2>
    <Table label="Workbooks" head={["Workbook", "Levels", "Status", "Made (Pacific)"]} empty="No workbooks yet.">
      {workbooks.map((w) => <tr key={w.id}>
        <td><Link href={adminWorkbookPath(w.id)}>Workbook {w.number}</Link></td><td>{w.levels.map((l) => `U${l}`).join(", ")}</td>
        <td><WorkbookStatusChip status={w.status} /></td><td>{when(w.createdAt)}</td>
      </tr>)}
    </Table>
    {/* #312: drafts made in the background, with their progress and check results. */}
    <h2>Workbook drafts</h2>
    <PrepareWorkbook childId={c.id} child={c.first_name} />
    <ChildRunsTable runs={runs} now={new Date()} />
  </AdminFrame>;
}
