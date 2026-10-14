import { isUuid, testAccess } from "@/lib/assessment-store";
import { refusalResponse, testFail, type StepResult } from "@/lib/test-api";
import { nextStep } from "@/lib/test-attempt";
import { attemptStore } from "@/lib/test-attempt-server";

// The next question of the parent's test, without its answer, or "complete". A test that ran out of time answers
// "expired" (410). The test attempt module (src/lib/test-attempt.ts, #146) reads it; this route only translates.
export async function GET(_request: Request, ctx: RouteContext<"/api/account/assessments/[id]">) {
  const access = await testAccess();
  if ("error" in access) return access.error;
  const { id } = await ctx.params;
  if (!isUuid(id)) return testFail("not_found", 404);
  const result = await nextStep(attemptStore(access.admin), access.parent, id, Date.now());
  if (!result.ok) return refusalResponse(result);
  return Response.json({ ok: true, step: result.step } satisfies StepResult, { headers: { "Cache-Control": "no-store" } });
}
