import { isUuid } from "@/lib/assessment-store";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { refusalResponse, testFail, type StepResult } from "@/lib/test-api";
import { doneChecking } from "@/lib/test-attempt";
import { attemptStore } from "@/lib/test-attempt-server";

// "Done checking" on a "Check your answers" grid (#249, #253): `{ section: "stage1" }`, `{ section: "stage2" }` or
// (#254) `{ section: "extra" }`. It locks the section and returns the next step: after stage 1, the first question
// after halfway (the break and quick facts come first); after stage 2, the extra round's offer or "Did anyone help?";
// after the extra round during the test, "Did anyone help?" (the round locks with the finish). The test attempt module
// (src/lib/test-attempt.ts) runs the rules and the store writes the lock; this route only translates.
export async function POST(request: Request, ctx: RouteContext<"/api/account/assessments/[id]/check">) {
  const parent = await parentId(await sessionClient());
  if (!parent) return testFail("signed_out", 401);
  const admin = adminClient();
  if (!admin) return testFail("store_failed", 503);
  const { id } = await ctx.params;
  if (!isUuid(id)) return testFail("not_found", 404);

  let body: { section?: unknown };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return testFail("bad_json", 400);
  }
  if (body.section !== "stage1" && body.section !== "stage2" && body.section !== "extra") return testFail("invalid", 400);

  // One clock reading for the whole request, as the other test steps (#72).
  const result = await doneChecking(attemptStore(admin), parent, id, body.section, Date.now());
  if (!result.ok) return refusalResponse(result);
  return Response.json({ ok: true, step: result.step } satisfies StepResult, { headers: { "Cache-Control": "no-store" } });
}
