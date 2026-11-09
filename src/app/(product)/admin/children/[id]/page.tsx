import Link from "next/link";
import { notFound } from "next/navigation";
import { getChild, getChildRuns, getChildWorkbooks, getWorkbookWorker, requireAdmin } from "@/lib/admin-store";
import { workbookRunner } from "@/lib/workbook-ai";
import { adminChildProfilePath, adminParentPath, adminWorkbookPath, when } from "@/lib/admin-view";
import { answerFacts, bookMix, fromRow, interestLabel, LEARNING_STYLES } from "@/lib/learning-style";
import { AdminFrame, Table, TestsTable, gradeAndPlace } from "@/components/admin";
import { RecordFacts } from "@/components/admin-records";
import { WorkbookStatusChip } from "@/components/admin-workbook";
import { ChildRunsTable, WorkerLine } from "@/components/admin-workbook-runs";
import { adminClient } from "@/lib/supabase-auth";
import { PrepareWorkbook } from "@/components/prepare-workbook";
import { BookInstructions, loadBookInstructions } from "./book-instructions";

export default async function ChildPage({ params }: PageProps<"/admin/children/[id]">) {
  const admin = await requireAdmin();
  const id = (await params).id;
  // D-200: runs are made on Savar's Mac unless WORKBOOK_RUNNER is "server"; the worker's status shows beside the button.
  const runner = workbookRunner();
  const [record, workbooks, runs, worker] = await Promise.all([getChild(admin, id), getChildWorkbooks(admin, id), getChildRuns(admin, id), runner === "mac" ? getWorkbookWorker(admin) : null]);
  if (!record) notFound();
  const { child: c, family } = record;
  const requests = await adminClient()?.from("workbook_restart_requests").select("generation,requested_at").eq("child_id", c.id).is("run_id", null);
  if (requests?.error) throw new Error(`Restart requests: ${requests.error.message}`);
  // #126: the parent's answers and the book mix they give. A child with no answer gets the default mix. #195 (D-107):
  // the feeling about math, the main goal and the time each week; they do not change the mix.
  const learning = fromRow(c);
  const mix = bookMix(learning);
  const instructions = await loadBookInstructions(admin, c, workbooks);
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
    <p><Link className="btn adm-btn" href={`/admin/children/${c.id}/preview-plan`} prefetch={false}>Preview plan</Link></p>
    <p><Link className="btn adm-btn" href={`/admin/children/${c.id}/preview-marks`} prefetch={false}>Preview from marks</Link></p>
    <BookInstructions child={c} note={learning?.note ?? ""} data={instructions} />
    <h3>Make the next workbook</h3>
    {!!requests?.data?.length && <p role="status">Paid Restart: prepare the next workbook from the current child profile. {requests.data.length} request pending. The request stays here until a new preparation run starts.</p>}
    <PrepareWorkbook childId={c.id} child={c.first_name} runner={runner} />
    {runner === "mac" && <p className="adm-note"><WorkerLine worker={worker} /></p>}
    <ChildRunsTable runs={runs} now={new Date()} worker={runner === "mac" ? worker : undefined} />
  </AdminFrame>;
}
