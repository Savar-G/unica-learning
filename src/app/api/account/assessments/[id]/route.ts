import { testStep } from "@/lib/assessment";
import { loadTest, testAccess } from "@/lib/assessment-store";
import type { StepResult } from "@/lib/test-api";

// The next question of the parent's test, without its answer, or "complete".
export async function GET(_request: Request, ctx: RouteContext<"/api/account/assessments/[id]">) {
  const access = await testAccess();
  if ("error" in access) return access.error;
  const loaded = await loadTest(access.admin, access.parent, (await ctx.params).id);
  if ("error" in loaded) return loaded.error;
  return Response.json({ ok: true, step: testStep(loaded.session) } satisfies StepResult, { headers: { "Cache-Control": "no-store" } });
}
