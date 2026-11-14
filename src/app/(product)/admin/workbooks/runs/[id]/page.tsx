import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getWorkbookRun, getWorkbookWorker, requireAdmin } from "@/lib/admin-store";
import { AdminWorkbookRun } from "@/components/admin-workbook-runs";
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
  return <AdminWorkbookRun email={admin.email} detail={detail} now={new Date()} only={query.only === "attention"} worker={worker} why={<><InstructionsUsed trace={instructions} /><WhyThisBook why={why} /></>} book1={<Book1Baseline status={book1} />} />;
}

function savedVersion(raw: string | string[] | undefined): number | undefined {
  const n = typeof raw === "string" && /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

