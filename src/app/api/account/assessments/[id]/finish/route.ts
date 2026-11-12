import { after } from "next/server";
import { isHelpAnswer } from "@/lib/assessment";
import { isUuid } from "@/lib/assessment-store";
import { linkOrigin } from "@/lib/account-server";
import { runReportJob } from "@/lib/report-job";
import { reportEmailAllowed } from "@/lib/report-retry-server";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { refusalResponse, testFail, type FinishResult } from "@/lib/test-api";
import { finishTest, type HelpInput } from "@/lib/test-attempt";
import { attemptStore } from "@/lib/test-attempt-server";

// Scores a complete test with the assessment core and stores the placement with the assessment.
// Safe to call twice: a finished test answers ok again. The test attempt module (src/lib/test-attempt.ts, #150) scores
// and stores it; this route reads the help answer from the request and only translates the result.
// The report job runs after the response (after()) with this function's 300 seconds, as in the retry route.
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/account/assessments/[id]/finish">) {
  const parent = await parentId(await sessionClient());
  if (!parent) return testFail("signed_out", 401);
  const admin = adminClient();
  if (!admin) return testFail("store_failed", 503);
  const { id } = await ctx.params;
  if (!isUuid(id)) return testFail("not_found", 404);

  // One clock reading for the whole request: the expiry check and the completion time use the same time (#72).
  const result = await finishTest(attemptStore(admin), parent, id, await helpAnswer(request), Date.now());
  if (!result.ok) return refusalResponse(result);
  // The report (#65) is built, stored and emailed after the response, so it never blocks or fails the finish.
  // The job is safe to run twice, so a repeated finish also completes a report step that failed before.
  // A first finish emails every family, test families too, and alerts the team when the job fails. A repeated finish
  // (#771 review) emails only when the retries' rule allows it (reportEmailAllowed, by the database's clock: finished
  // at least 10 minutes and under 48 hours ago, not a test family or a team account), so a parent never gets the email
  // late from an old test. Within the first 10 minutes it builds only: the first finish's own job sends the email, and
  // the retries send it when that job failed.
  const origin = linkOrigin(request);
  const assessmentId = result.id;
  after(() => runReportJob(assessmentId, origin, result.finished === "already" ? { mayEmail: () => reportEmailAllowed(assessmentId) } : {}));
  return Response.json({ ok: true } satisfies FinishResult);
}

/** #71: the child's answer to "Did anyone help?", asked after the last question. Absent (an older screen) = not asked. */
async function helpAnswer(request: Request): Promise<HelpInput> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // No body: finished without the help question.
    return null;
  }
  const value = body && typeof body === "object" ? (body as { help?: unknown }).help : undefined;
  if (value === undefined || value === null) return null;
  return isHelpAnswer(value) ? value : "invalid";
}
