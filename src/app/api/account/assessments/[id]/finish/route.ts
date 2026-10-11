import { after } from "next/server";
import { HELP_ANSWERS, finish, testStep, type HelpAnswer } from "@/lib/assessment";
import { loadTest, testAccess } from "@/lib/assessment-store";
import { linkOrigin } from "@/lib/account-server";
import { loadFacts } from "@/lib/facts-store";
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
  const scheduleReport = () => after(() => runReportJob(row.id, origin));
  if (row.status === "completed") {
    scheduleReport();
    return Response.json({ ok: true } satisfies FinishResult);
  }
  if (row.status !== "in_progress" || testStep(session).status !== "complete") return testFail("incomplete", 409);

  // #71: the child's answer to "Did anyone help?", asked after the last question. Absent (an older screen) = not asked.
  let help: HelpAnswer | null = null;
  try {
    const body: unknown = await request.json();
    const value = body && typeof body === "object" ? (body as { help?: unknown }).help : undefined;
    if (value !== undefined && value !== null) {
      if (!HELP_ANSWERS.includes(value as HelpAnswer)) return testFail("invalid", 400);
      help = value as HelpAnswer;
    }
  } catch {
    // No body: finished without the help question.
  }

  // The timed facts section (#70) goes into the placement beside the test; null when the child had none.
  const facts = await loadFacts(admin, row.id);
  if (facts && "error" in facts) return facts.error;
  const placement = finish(session, facts?.session ?? null, help);
  const { error } = await admin.from("assessments")
    .update({ status: "completed", completed_at: new Date().toISOString(), route: placement.route, placement, help })
    .eq("id", row.id).eq("status", "in_progress");
  if (error) {
    console.error("[test] finish failed", error.message);
    return testFail("store_failed", 502);
  }
  scheduleReport();
  return Response.json({ ok: true } satisfies FinishResult);
}
