import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Province, ReportModel } from "@/lib/assessment";
import { isUuid } from "@/lib/assessment-store";
import { pageMetadata } from "@/lib/metadata";
import { reportReturnPath, type ReportView } from "@/lib/report-view";
import type { PlanId } from "@/lib/site";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { signWork } from "@/lib/work-store";
import { TrackOnce } from "@/components/account";
import { ReportCard, type ReportNextContext } from "@/components/report";
import type { NextStepStart } from "@/components/report-next";
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
  child_id: string;
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
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  // "email" when the parent came from the report email, for the report_open event.
  const src = query.src === "email" ? "email" : "account";
  // The email's next step link (#66): the plan choice or the waitlist. Sign-in comes back to the same step.
  const step = query.step === "plan" || query.step === "waitlist" ? query.step : null;
  const db = await sessionClient();
  if (!(await parentId(db))) redirect(`/sign-in?next=${encodeURIComponent(reportReturnPath(id, { src, step }))}`);

  const { data: row } = await db.from("reports")
    .select("id, child_id, model, questions, minutes, assessment:assessments(completed_at, province), child:children(first_name)")
    .eq("id", id).maybeSingle<ReportPageRow>();
  if (!row?.assessment || !row.child) notFound();

  // #67: the work drawings are in a private bucket. Signed with the parent's own session, so storage checks that each
  // file is in their folder; the URLs stop working after a few minutes.
  const workPaths = (row.model.work ?? []).flatMap((w) => (w.image ? [w.image] : []));
  const view: ReportView = {
    id: row.id,
    childName: row.child.first_name,
    province: row.assessment.province,
    completedAt: row.assessment.completed_at,
    questions: row.questions,
    minutes: row.minutes,
    model: row.model,
    workImages: await signWork(db, workPaths),
  };
  // Back from the payment page without a card: not a new report open.
  const cancelled = query.card === "cancelled";
  const next: ReportNextContext = { src, asked: step !== null, start: { ...(await nextStepStart(db, row.child_id)), cancelled } };
  return (
    <SupportPage label="" title="" wide>
      {!cancelled && <TrackOnce event="report_open" props={{ src }} />}
      <p className="small rpt-back"><Link href="/account">← Your account</Link></p>
      <ReportCard view={view} next={next} />
    </SupportPage>
  );
}

/** A card saved or a waitlist join for this child, read with the parent's session (#66). */
async function nextStepStart(db: Awaited<ReturnType<typeof sessionClient>>, childId: string): Promise<Omit<NextStepStart, "cancelled">> {
  const [card, wait] = await Promise.all([
    db.from("card_setups").select("plan, card_saved_at").eq("child_id", childId).maybeSingle<{ plan: PlanId; card_saved_at: string | null }>(),
    db.from("waitlist_joins").select("child_id").eq("child_id", childId).maybeSingle(),
  ]);
  return { saved: card.data?.card_saved_at ? card.data.plan : null, joined: !!wait.data };
}
