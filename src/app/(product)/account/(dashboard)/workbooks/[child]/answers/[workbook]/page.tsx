import { notFound, redirect } from "next/navigation";
import { ParentWorkbookAnswerKey } from "@/components/parent-workbook-answers";
import { pageMetadata } from "@/lib/metadata";
import { parentDashboardAccess } from "@/lib/parent-dashboard-access";
import { readParentWorkbookAnswers } from "@/lib/parent-workbook-answers";
import { parentWorkbookAnswerSource } from "@/lib/parent-workbook-answers-server";
import { parentId, sessionClient } from "@/lib/supabase-auth";

export const metadata = pageMetadata({ path: "/account/workbooks", title: "Workbook answers", description: "Answers for your delivered workbook.", index: false });

async function load(session: Awaited<ReturnType<typeof sessionClient>>, parent: string, child: string, workbook: string) {
  return readParentWorkbookAnswers(parentWorkbookAnswerSource(session, parent), { parentId: parent, childId: child, workbookId: workbook }, Date.now());
}

// Cookies make this request-specific. The page checks the family, child, book and effective receipt on every request.
export default async function WorkbookAnswers({ params }: PageProps<"/account/workbooks/[child]/answers/[workbook]">) {
  const session = await sessionClient();
  const parent = await parentId(session);
  if (!parent) redirect("/sign-in");
  if (!await parentDashboardAccess(parent)) notFound();
  const { child, workbook } = await params;
  const answerKey = await load(session, parent, child, workbook);
  if (!answerKey) notFound();
  return <ParentWorkbookAnswerKey answerKey={answerKey} />;
}
