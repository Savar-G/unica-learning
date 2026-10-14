import { isUuid } from "@/lib/assessment-store";
import type { FactsStepResult } from "@/lib/facts-api";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { refusalResponse, testFail } from "@/lib/test-api";
import { readFacts, startFacts } from "@/lib/test-attempt";
import { attemptStore } from "@/lib/test-attempt-server";

// The timed facts section (#70). GET: where the section is ("ready", "running" with the facts still to come, or "done").
// POST: starts the section. The server's clock starts the time, and only the server decides when it is up.
// The test attempt module (src/lib/test-attempt.ts, #148) runs the section; these routes only translate.
const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(_request: Request, ctx: RouteContext<"/api/account/assessments/[id]/facts">) {
  const parent = await parentId(await sessionClient());
  if (!parent) return testFail("signed_out", 401);
  const admin = adminClient();
  if (!admin) return testFail("store_failed", 503);
  const { id } = await ctx.params;
  if (!isUuid(id)) return testFail("not_found", 404);
  const result = await readFacts(attemptStore(admin), parent, id, Date.now());
  if (!result.ok) return refusalResponse(result);
  return Response.json({ ok: true, step: result.step } satisfies FactsStepResult, noStore);
}

export async function POST(_request: Request, ctx: RouteContext<"/api/account/assessments/[id]/facts">) {
  const parent = await parentId(await sessionClient());
  if (!parent) return testFail("signed_out", 401);
  const admin = adminClient();
  if (!admin) return testFail("store_failed", 503);
  const { id } = await ctx.params;
  if (!isUuid(id)) return testFail("not_found", 404);
  const result = await startFacts(attemptStore(admin), parent, id, Date.now());
  if (!result.ok) return refusalResponse(result);
  return Response.json({ ok: true, step: result.step } satisfies FactsStepResult);
}
