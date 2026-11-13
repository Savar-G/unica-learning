import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getWorkbookRun, getWorkbookWorker, requireAdmin } from "@/lib/admin-store";
import { AdminWorkbookRun, type RunNewMarks } from "@/components/admin-workbook-runs";
import { draftNewMarksOnServer } from "@/lib/next-book-refresh-server";
import { nextBookWiring } from "@/lib/next-book-planner";
import { adminClient } from "@/lib/supabase-auth";
import { savedBook1Baseline, savedWorkbookInstructions, savedWorkbookWhy } from "../../[id]/saved-why";
import { Book1Baseline } from "../../[id]/book1-baseline";
import { InstructionsUsed } from "../../[id]/instructions-used";
import { WhyThisBook } from "../../[id]/why-this-book";

// #312: one "Prepare next workbook" run: its progress or its error, then its draft page by page (the page image beside
// each question's data), then the audit log. ?only=attention shows only the pages that need attention; ?version=N shows
// that saved version in the review (only the version on screen is loaded).
export default async function WorkbookRunPage({ params, searchParams }: PageProps<"/admin/workbooks/runs/[id]">) {
  const admin = await requireAdmin();
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [detail, worker, why, instructions, book1] = await Promise.all([getWorkbookRun(admin, id, { version: savedVersion(query.version) }), getWorkbookWorker(admin), savedWorkbookWhy(admin, id), savedWorkbookInstructions(admin, id), savedBook1Baseline(admin, id)]);
  if (!detail) notFound();
  const newMarks = await runNewMarks(detail.draft?.workbook.id ?? null, !!detail.approved && detail.approved.status !== "draft");
  return <AdminWorkbookRun newMarks={newMarks} email={admin.email} detail={detail} now={new Date()} only={query.only === "attention"} worker={worker} why={<><InstructionsUsed trace={instructions} /><WhyThisBook why={why} /></>} book1={<Book1Baseline status={book1} />} />;
}

function savedVersion(raw: string | string[] | undefined): number | undefined {
  const n = typeof raw === "string" && /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * D-308: for a next-book draft not yet approved, the marks its plan did not use ("New marks since this draft") and the
 * plan version an "Update with new marks" wrote. Undefined for any other draft. Read with the service key after
 * requireAdmin, as the snapshot store reads marking items and pages across the family.
 */
async function runNewMarks(draftId: string | null, approved: boolean): Promise<RunNewMarks | undefined> {
  const db = draftId && !approved ? adminClient() : null;
  if (!db || !draftId) return undefined;
  const marks = await draftNewMarksOnServer(db, draftId);
  const ready = nextBookWiring() !== null;
  if (marks.kind === "none") return undefined;
  if (marks.kind === "unavailable") return { line: null, updated: null, ready, unavailable: true };
  if (marks.kind === "new") return { line: marks.line, updated: null, ready };
  return { line: null, updated: marks.revision > 1 ? marks.revision : null, ready };
}
