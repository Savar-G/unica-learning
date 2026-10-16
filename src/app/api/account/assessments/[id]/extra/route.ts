import { isUuid } from "@/lib/assessment-store";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { refusalResponse, testFail, type StepResult } from "@/lib/test-api";
import { skipExtraRound, takeExtraRound } from "@/lib/test-attempt";
import { attemptStore } from "@/lib/test-attempt-server";

// The optional extra round (#190): the child's choice after the last main question, `{ take: true }` or
// `{ take: false }`. Taking it stores the round's questions and sends the first one; it also starts a round the
// report offers again on the completed test, or carries on with a round that has started. Skipping it sends the step
// to "Did anyone help?". The test attempt module (src/lib/test-attempt.ts) runs the rules; this route only translates.
export async function POST(request: Request, ctx: RouteContext<"/api/account/assessments/[id]/extra">) {
  const parent = await parentId(await sessionClient());
  if (!parent) return testFail("signed_out", 401);
  const admin = adminClient();
  if (!admin) return testFail("store_failed", 503);
  const { id } = await ctx.params;
  if (!isUuid(id)) return testFail("not_found", 404);

  let body: { take?: unknown };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return testFail("bad_json", 400);
  }
  if (typeof body.take !== "boolean") return testFail("invalid", 400);

  // One clock reading for the whole request, as the other test steps (#72).
  const store = attemptStore(admin);
  const result = body.take ? await takeExtraRound(store, parent, id, Date.now()) : await skipExtraRound(store, parent, id, Date.now());
  if (!result.ok) return refusalResponse(result);
  return Response.json({ ok: true, step: result.step } satisfies StepResult, { headers: { "Cache-Control": "no-store" } });
}
