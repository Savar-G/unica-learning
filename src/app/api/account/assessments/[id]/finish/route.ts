import { after } from "next/server";
import { finish, testStep } from "@/lib/assessment";
import { loadTest, testAccess } from "@/lib/assessment-store";
import { linkOrigin } from "@/lib/account-server";
import { runReportJob } from "@/lib/report-job";
import { testFail, type FinishResult } from "@/lib/test-api";

// Scores a complete test with the assessment core and stores the placement with the assessment.
// Safe to call twice: a finished test answers ok again.
export async function POST(request: Request, ctx: RouteContext<"/api/account/assessments/[id]/finish">) {
  const access = await testAccess();
  if ("error" in access) return access.error;
  const { admin, parent } = access;
  const loaded = await loadTest(admin, parent, (await ctx.params).id);
  if ("error" in loaded) return loaded.error;
  const { row, session } = loaded;
  // The report (#65) is built, stored and emailed after the response, so it never blocks or fails the finish.
  // The job is safe to run twice, so a repeated finish also completes a report step that failed before.
  const origin = linkOrigin(request);
  const report = () => after(() => runReportJob(row.id, origin));
  if (row.status === "completed") {
    report();
    return Response.json({ ok: true } satisfies FinishResult);
  }
  if (row.status !== "in_progress" || testStep(session).status !== "complete") return testFail("incomplete", 409);

  const placement = finish(session);
  const { error } = await admin.from("assessments")
    .update({ status: "completed", completed_at: new Date().toISOString(), route: placement.route, placement })
    .eq("id", row.id).eq("status", "in_progress");
  if (error) {
    console.error("[test] finish failed", error.message);
    return testFail("store_failed", 502);
  }
  report();
  return Response.json({ ok: true } satisfies FinishResult);
}
