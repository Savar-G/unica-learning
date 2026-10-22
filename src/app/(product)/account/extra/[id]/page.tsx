import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { userAgent } from "next/server";
import { bandFor, type Grade } from "@/lib/assessment";
import { isUuid } from "@/lib/assessment-store";
import { pageMetadata } from "@/lib/metadata";
import { extraRoundPath, reportPath } from "@/lib/report-view";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { parentExtraRound } from "@/lib/test-attempt-server";
import { TakeTest } from "@/components/test";

export const metadata = pageMetadata({
  path: "/account/extra",
  title: "Extra questions",
  description: "Extra questions for your child's math report.",
  index: false,
});

// The extra round of a completed test (#190), which the report offers again while the test is the child's latest: the
// round the child skipped, or the rest of one the child started. The test, the child and the report are read with the
// parent's own session, so row-level security returns only their rows; the round's state comes from the test attempt
// module. When no round is open, the parent goes back to the report.
export default async function ExtraRoundPage({ params }: PageProps<"/account/extra/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) redirect(`/sign-in?next=${encodeURIComponent(extraRoundPath(id))}`);
  // On a phone the account page asks for a laptop or tablet (D-082).
  if (userAgent({ headers: await headers() }).device.type === "mobile") redirect("/account");

  const [{ data: test }, { data: report }, state] = await Promise.all([
    db.from("assessments").select("id, child_id, grade").eq("id", id).maybeSingle(),
    db.from("reports").select("id").eq("assessment_id", id).maybeSingle(),
    parentExtraRound(parent, id),
  ]);
  if (!test) notFound();
  const reportHref = report ? reportPath(report.id) : null;
  if (!state) redirect(reportHref ?? "/account");
  const { data: child } = await db.from("children").select("first_name").eq("id", test.child_id).maybeSingle();
  if (!child) notFound();

  const band = bandFor(test.grade as Grade);
  return (
    <TakeTest
      childId={test.child_id}
      name={child.first_name}
      breakAfter={band.stage1}
      ready
      done={false}
      typing={band.whiteboardTyping}
      extra={{ testId: id, questions: state.offer.questions, answered: state.kind === "continue" ? state.answered : 0, reportHref }}
    />
  );
}
