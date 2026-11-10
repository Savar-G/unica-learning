import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { familyProduction, getChild, getChildRuns, getChildWorkbooks, getWorkbookWorker, requireAdmin } from "@/lib/admin-store";
import { workbookRunner } from "@/lib/workbook-ai";
import { buildBooks } from "@/lib/admin-production";
import { adminChildProfilePath, adminParentPath, when } from "@/lib/admin-view";
import { answerFacts, bookMix, fromRow, interestLabel } from "@/lib/learning-style";
import { TestTag, TestsTable, gradeAndPlace } from "@/components/admin";
import { AdminFrame } from "@/components/admin-frame";
import { RecordFacts } from "@/components/admin-records";
import { ChildHead, LearnsCard, WorkbookList } from "@/components/admin-child-page";
import { SectionHead } from "@/components/admin-family-page";
import { ChildRunsTable, WorkerLine } from "@/components/admin-workbook-runs";
import { adminClient } from "@/lib/supabase-auth";
import { PrepareWorkbook } from "@/components/prepare-workbook";
import { PrepareFromSnapshot } from "@/components/prepare-from-snapshot";
import { nextBookButtonState } from "@/lib/next-book-button";
import { nextBookWiring } from "@/lib/next-book-planner";
import { loadTestFamilies } from "@/lib/admin-test-families-server";
import { AdminScanProgress } from "@/components/admin-scan-progress";
import { loadAdminScanProgress } from "@/lib/admin-scan-progress-server";
import { BookInstructions, loadBookInstructions } from "./book-instructions";

// One child (D-313, D-315): a head card with the current workbook on Production's stages and its one action, then how
// the child learns, the workbooks (the current one first) with their scan progress, the tests, and the tools that plan
// the next book. A detail page: test families always show here.
export default async function ChildPage({ params }: PageProps<"/admin/children/[id]">) {
  const admin = await requireAdmin();
  const id = (await params).id;
  // D-200: runs are made on the workbook computer unless WORKBOOK_RUNNER is "server"; its status shows beside the button.
  const runner = workbookRunner();
  const [record, workbooks, runs, worker] = await Promise.all([getChild(admin, id), getChildWorkbooks(admin, id), getChildRuns(admin, id), runner === "mac" ? getWorkbookWorker(admin) : null]);
  if (!record) notFound();
  const { child: c, family } = record;
  const now = new Date();
  const [requests, production, tests] = await Promise.all([
    adminClient()?.from("workbook_restart_requests").select("generation,requested_at").eq("child_id", c.id).is("run_id", null),
    familyProduction(admin, c.parent_id, now),
    loadTestFamilies(admin),
  ]);
  if (requests?.error) throw new Error(`Restart requests: ${requests.error.message}`);
  // #126: the parent's answers and the book mix they give. A child with no answer gets the default mix. #195 (D-107):
  // the feeling about math, the main goal and the time each week; they do not change the mix.
  const learning = fromRow(c);
  const mix = bookMix(learning);
  const instructions = await loadBookInstructions(admin, c, workbooks);
  // #476: "Prepare from snapshot" for the child's delivered book 1. With no planner nothing is read for it; a failed read
  // shows a note and never breaks this page.
  const nextBook = await nextBookButtonState({
    ready: nextBookWiring() !== null,
    book1Id: workbooks.find((w) => w.number === 1)?.id ?? null,
    delivered: async (bookId) => {
      const { data, error } = await admin.db.from("workbook_delivery_receipts").select("workbook_id").eq("workbook_id", bookId).maybeSingle();
      if (error) throw new Error("book 1 delivery read");
      return data?.workbook_id === bookId;
    },
  });
  const shipped = workbooks.filter(w => w.status === "shipped");
  const scanViews = await Promise.all(shipped.map(w => loadAdminScanProgress(admin, { parentId: c.parent_id, childId: c.id, workbookId: w.id })));
  const scans = new Map<string, ReactNode>(shipped.map((w, i) => [w.id, <AdminScanProgress key={w.id} workbookId={w.id} view={scanViews[i].view} missingDelivery={scanViews[i].missingDelivery} />]));
  const isTest = tests.isTest(c.parent_id);
  const book = buildBooks({ ...production, tests: { show: true, isTest: () => isTest }, children: [{ id: c.id, parentId: c.parent_id, firstName: c.first_name }], parents: [{ id: family.parent.id, name: family.parent.name }] }, now)
    .find((b) => b.childId === c.id) ?? null;
  // The head card holds the prepare button while the child has no workbook yet; after that it sits with the planning tools.
  const prepareInHead = !book || book.stage === "none";
  const restart = !!requests?.data?.length && <p role="status" className="rec-warn">Paid Restart: prepare the next workbook from the current child profile. {requests.data.length} request pending. The request stays here until a new preparation run starts.</p>;

  return <AdminFrame email={admin.email} title={<>{c.first_name}<TestTag test={isTest} /></>}
    lead={<>{gradeAndPlace(c.grade, c.province)}. Family: <Link href={adminParentPath(c.parent_id)}>{family.parent.name}</Link>.</>}
    actions={<>
      <Link className="btn ghost adm-btn" href={adminParentPath(c.parent_id)} prefetch={false}>Open the family</Link>
      <Link className="btn ghost adm-btn" href={adminChildProfilePath(c.id)} prefetch={false}>Open the profile</Link>
    </>}>
    <ChildHead book={book} childId={c.id} child={c.first_name} runner={runner} now={now} restart={prepareInHead ? restart : null} facts={[
      ["Grade and curriculum", gradeAndPlace(c.grade, c.province)],
      ["Parent", <Link key="parent" href={adminParentPath(c.parent_id)}>{family.parent.name}</Link>],
      ["Added (Pacific)", when(c.created_at)],
      ["Workbook computer", runner === "mac" ? <WorkerLine key="worker" worker={worker} /> : "Made on the server"],
    ]} />

    <LearnsCard name={c.first_name} profileHref={adminChildProfilePath(c.id)}
      // A cleared answer keeps its save time, so the date shows only with answers.
      answers={answerFacts(learning)} answeredAt={learning && c.learning_updated_at ? `${when(c.learning_updated_at)} (Pacific)` : "never"}
      mix={mix} settings={mix.settings.length ? mix.settings.map(interestLabel).join(", ") : "A mix of everyday settings"} />

    {/* #299: each workbook as data, newest first. */}
    <section className="rec-sec" aria-labelledby="rec-workbooks">
      <SectionHead id="rec-workbooks" title="Workbooks" count={workbooks.length} hint="The newest first, with scan progress once a book is shipped." />
      <WorkbookList workbooks={workbooks} scans={scans} />
    </section>

    <section className="rec-sec" aria-labelledby="rec-tests">
      <SectionHead id="rec-tests" title="Tests and reports" count={family.tests.length} />
      <TestsTable tests={family.tests} family />
    </section>

    <section className="rec-sec" aria-labelledby="rec-plan">
      <SectionHead id="rec-plan" title="Plan the next book" hint="Instructions, previews and the runs that make each draft." />
      <div className="rec-tools">
        <Link className="btn ghost adm-btn" href={`/admin/children/${c.id}/preview-plan`} prefetch={false}>Preview plan</Link>
        <Link className="btn ghost adm-btn" href={`/admin/children/${c.id}/preview-marks`} prefetch={false}>Preview from marks</Link>
      </div>
      <BookInstructions child={c} note={learning?.note ?? ""} data={instructions} />
      <h3>Make the next workbook</h3>
      {!prepareInHead && restart}
      {!prepareInHead ? <PrepareWorkbook childId={c.id} child={c.first_name} runner={runner} /> : <p className="adm-note">Use the button at the top of the page to prepare the first workbook.</p>}
      {nextBook !== "hidden" && <PrepareFromSnapshot childId={c.id} state={nextBook} />}
      {/* #312: drafts made in the background, with their progress and check results. */}
      <h3>Workbook drafts</h3>
      <ChildRunsTable runs={runs} now={now} worker={runner === "mac" ? worker : undefined} />
    </section>

    <details className="adm-tech">
      <summary>Technical details</summary>
      <RecordFacts facts={[["Child id", <span key="id" className="adm-mono">{c.id}</span>], ["Parent id", <span key="parent" className="adm-mono">{c.parent_id}</span>]]} />
    </details>
  </AdminFrame>;
}
