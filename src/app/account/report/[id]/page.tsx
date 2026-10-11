import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Province, ReportModel } from "@/lib/assessment";
import { isUuid } from "@/lib/assessment-store";
import { pageMetadata } from "@/lib/metadata";
import { requirePilot } from "@/lib/pilot";
import { reportPath, type ReportView } from "@/lib/report-view";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { TrackOnce } from "@/components/account";
import { ReportCard } from "@/components/report";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/account/report",
  title: "Math report",
  description: "Your child's math placement report.",
  index: false,
});

/** The report as the parent's session reads it, with its test and child. */
interface ReportPageRow {
  id: string;
  model: ReportModel;
  questions: number;
  minutes: number;
  assessment: { completed_at: string; province: Province } | null;
  child: { first_name: string } | null;
}

// One child's report (#65), read with the parent's own session: row-level security returns only their reports, so
// another family's report id finds nothing. The report email links here; a signed-out parent signs in and comes back.
// The child sees it with the parent, on the same account (D-082).
export default async function ReportPage({ params, searchParams }: PageProps<"/account/report/[id]">) {
  await requirePilot();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  // "email" when the parent came from the report email, for the report_open event.
  const src = (await searchParams).src === "email" ? "email" : "account";
  const db = await sessionClient();
  if (!(await parentId(db))) redirect(`/sign-in?next=${encodeURIComponent(`${reportPath(id)}${src === "email" ? "?src=email" : ""}`)}`);

  const { data: row } = await db.from("reports")
    .select("id, model, questions, minutes, assessment:assessments(completed_at, province), child:children(first_name)")
    .eq("id", id).maybeSingle<ReportPageRow>();
  if (!row?.assessment || !row.child) notFound();

  const view: ReportView = {
    id: row.id,
    childName: row.child.first_name,
    province: row.assessment.province,
    completedAt: row.assessment.completed_at,
    questions: row.questions,
    minutes: row.minutes,
    model: row.model,
  };
  return (
    <SupportPage label="" title="" wide>
      <TrackOnce event="report_open" props={{ src }} />
      <p className="small rpt-back"><Link href="/account">← Your account</Link></p>
      <ReportCard view={view} />
    </SupportPage>
  );
}
