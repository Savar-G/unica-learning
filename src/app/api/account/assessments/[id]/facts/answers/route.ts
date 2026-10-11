import { factsStep, submitFact } from "@/lib/assessment";
import { testAccess } from "@/lib/assessment-store";
import { isFactResponse, type FactsStepResult } from "@/lib/facts-api";
import { factsOwner, loadFacts, stepNow } from "@/lib/facts-store";
import { testFail } from "@/lib/test-api";

// Marks one fact with the assessment core and stores it. The time is the server's: when the answer arrived, since the
// section started. An answer that arrives after the time is up is not stored, and the step says "done".
export async function POST(request: Request, ctx: RouteContext<"/api/account/assessments/[id]/facts/answers">) {
  const access = await testAccess();
  if ("error" in access) return access.error;
  const { admin, parent } = access;

  let body: { factId?: unknown; response?: unknown };
  try {
    body = await request.json();
  } catch {
    return testFail("bad_json", 400);
  }
  if (typeof body.factId !== "string" || !isFactResponse(body.response)) return testFail("invalid", 400);

  const owner = await factsOwner(admin, parent, (await ctx.params).id);
  if ("error" in owner) return owner.error;
  if (owner.status !== "in_progress") return testFail("conflict", 409);
  const loaded = await loadFacts(admin, owner.id);
  if (!loaded) return testFail("conflict", 409);
  if ("error" in loaded) return loaded.error;
  const { session, startedAt } = loaded;

  // Never earlier than the answer before it, in case two server instances' clocks differ by a few milliseconds.
  const atMs = Math.max(Date.now() - startedAt, session.answers.at(-1)?.atMs ?? 0);
  let next;
  try {
    next = submitFact(session, { factId: body.factId, response: body.response, atMs });
  } catch {
    // The time is up, or another request answered this fact first: send where the section is now.
    return testFail("conflict", 409, { step: factsStep(session, atMs) });
  }
  const marked = next.answers.at(-1)!;
  const { error } = await admin.from("fact_answers").insert({
    assessment_id: owner.id,
    position: session.answers.length,
    fact_id: marked.factId,
    response: marked.response,
    correct: marked.correct,
    at_ms: Math.round(marked.atMs),
  });
  if (error) {
    if (error.code === "23505") {
      const fresh = await loadFacts(admin, owner.id);
      if (fresh && !("error" in fresh)) return testFail("conflict", 409, { step: stepNow(fresh) });
    }
    console.error("[facts] answer save failed", error.message);
    return testFail("store_failed", 502);
  }
  return Response.json({ ok: true, step: factsStep(next, atMs) } satisfies FactsStepResult);
}
