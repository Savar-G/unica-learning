import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import { fromRow, LEARNING_COLUMNS, type LearningAnswers, type LearningRow } from "@/lib/learning-style";
import { pageMetadata } from "@/lib/metadata";
import { loadReportView } from "@/lib/report-loading";
import { parentReportReader } from "@/lib/report-loading-server";
import { extraRoundPath, reportReturnPath } from "@/lib/report-view";
import type { PlanId } from "@/lib/site";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { recordReportEmailClick } from "@/lib/email-clicks";
import { TrackOnce } from "@/components/account";
import { ReportCard, type ExtraRoundOffer, type NewTestOffer, type ReportNextContext } from "@/components/report";
import { startPath } from "@/lib/sign-in-link";
import { parentExtraRound, parentRetakeState } from "@/lib/test-attempt-server";
import type { NextStepStart } from "@/components/report-next";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/account/report",
  title: "Math report",
  description: "Your child's math placement report.",
  index: false,
});

// One child's report (#65), read with the parent's own session through the report-loading module (#161): row-level
// security returns only their reports, so another family's report id finds nothing, and the work drawings (#67, in a
// private bucket) are signed with the parent's session, so storage checks that each file is in their folder. The report
// email links here; a signed-out parent signs in and comes back. The child sees it with the parent, on the same account
// (D-082).
export default async function ReportPage({ params, searchParams }: PageProps<"/account/report/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  // "email" when the parent came from the report email, for the report_open event.
  const src = query.src === "email" ? "email" : "account";
  // The email's next step link (#66): the plan choice or the waitlist. Sign-in comes back to the same step.
  const step = query.step === "plan" || query.step === "waitlist" ? query.step : null;
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) redirect(`/sign-in?next=${encodeURIComponent(reportReturnPath(id, { src, step }))}`);

  // #198: the learner profile is read with the secret key, filtered on this parent's own test; only its parent's part
  // (strengths, struggles, the workbook 1 preview) reaches the page.
  const report = await loadReportView(parentReportReader(db, { admin: adminClient(), parentId: parent }), id);
  if (!report) notFound();
  const { view, childId, assessmentId } = report;

  const [start, learning, newTest, extraRound] = await Promise.all([
    nextStepStart(db, childId),
    learningStart(db, childId),
    view.model.reliability ? newTestOffer(parent, childId) : null,
    extraRoundOffer(parent, assessmentId),
  ]);
  // Back from the payment page without a card: not a new report open.
  const cancelled = query.card === "cancelled";
  // The click on the report email's button (D-105), counted after the page is sent. Only for this parent's own report.
  if (src === "email" && !cancelled) {
    after(async () => {
      const admin = adminClient();
      if (admin) await recordReportEmailClick(admin, parent, id);
    });
  }
  const next: ReportNextContext = {
    src,
    asked: step !== null,
    start: { ...start, cancelled },
    // #126: how the child learns, asked above the plan choice; the parent can skip it.
    learning: { childId, start: learning },
  };
  return (
    <SupportPage label="" title="" wide>
      {!cancelled && <TrackOnce event="report_open" props={{ src }} />}
      <p className="small rpt-back"><Link href="/account">← Your account</Link></p>
      <ReportCard view={view} next={next} newTest={newTest} extraRound={extraRound} />
    </SupportPage>
  );
}

/**
 * #190: the extra round this report offers while its test is the child's latest: the round the child skipped, or the
 * rest of one the child started. Null when there is none, or it cannot be read.
 */
async function extraRoundOffer(parent: string, assessmentId: string): Promise<ExtraRoundOffer | null> {
  const state = await parentExtraRound(parent, assessmentId);
  if (!state) return null;
  const card = state.kind === "continue"
    ? { kind: "continue" as const, questions: state.offer.questions, answered: state.answered }
    : { kind: "offer" as const, questions: state.offer.questions };
  return { card, href: extraRoundPath(assessmentId) };
}

/**
 * #189: when the child's next test opens after a result that may not be reliable, by the same start rules as the start
 * screen: at once (at most once per 30 days, D-108), with the button; otherwise the day it opens. Null when that cannot
 * be read: the note then shows no button and names no time.
 */
async function newTestOffer(parent: string, childId: string): Promise<NewTestOffer | null> {
  const state = await parentRetakeState(parent, childId);
  if (!state) return null;
  const href = startPath(childId);
  if (state.kind === "opens") return { state, href, label: "" };
  return { state: { kind: "open" }, href, label: state.resume ? "Continue the new test" : "Start a new test" };
}

/** The parent's answers about how this child learns (#126), read with the parent's session; null when none. */
async function learningStart(db: Awaited<ReturnType<typeof sessionClient>>, childId: string): Promise<LearningAnswers | null> {
  const { data } = await db.from("children").select(LEARNING_COLUMNS).eq("id", childId).maybeSingle<LearningRow>();
  return data ? fromRow(data) : null;
}

/** A card saved or a waitlist join for this child, read with the parent's session (#66). */
async function nextStepStart(db: Awaited<ReturnType<typeof sessionClient>>, childId: string): Promise<Omit<NextStepStart, "cancelled">> {
  const [card, wait] = await Promise.all([
    db.from("card_setups").select("plan, card_saved_at").eq("child_id", childId).maybeSingle<{ plan: PlanId; card_saved_at: string | null }>(),
    db.from("waitlist_joins").select("child_id").eq("child_id", childId).maybeSingle(),
  ]);
  return { saved: card.data?.card_saved_at ? card.data.plan : null, joined: !!wait.data };
}
