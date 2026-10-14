import { isUuid } from "@/lib/assessment-store";
import { isFactResponse, type FactsStepResult } from "@/lib/facts-api";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { refusalResponse, testFail } from "@/lib/test-api";
import { answerFact } from "@/lib/test-attempt";
import { attemptStore } from "@/lib/test-attempt-server";

// Marks one fact with the assessment core and stores it. The time is the server's: when the answer arrived, since the
// section started. An answer that arrives after the time is up is not stored, and the step says "done".
// The test attempt module (src/lib/test-attempt.ts, #148) does this; the route only translates.
export async function POST(request: Request, ctx: RouteContext<"/api/account/assessments/[id]/facts/answers">) {
  const parent = await parentId(await sessionClient());
  if (!parent) return testFail("signed_out", 401);
  const admin = adminClient();
  if (!admin) return testFail("store_failed", 503);

  let body: { factId?: unknown; response?: unknown };
  try {
    body = await request.json();
  } catch {
    return testFail("bad_json", 400);
  }
  if (typeof body.factId !== "string" || !isFactResponse(body.response)) return testFail("invalid", 400);

  const { id } = await ctx.params;
  if (!isUuid(id)) return testFail("not_found", 404);
  const result = await answerFact(attemptStore(admin), parent, id, Date.now(), { factId: body.factId, response: body.response });
  if (!result.ok) return refusalResponse(result);
  return Response.json({ ok: true, step: result.step } satisfies FactsStepResult);
}
