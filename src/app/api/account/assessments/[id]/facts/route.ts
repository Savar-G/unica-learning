import { FACTS_SECONDS, createFacts, factsStep, storedFacts } from "@/lib/assessment";
import { testAccess } from "@/lib/assessment-store";
import type { FactsStepResult } from "@/lib/facts-api";
import { factsOwner, loadFacts } from "@/lib/facts-store";
import { testFail } from "@/lib/test-api";

// The timed facts section (#70). GET: where the section is ("ready", "running" with the facts still to come, or "done").
// POST: starts the section. The server's clock starts the time, and only the server decides when it is up.
const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(_request: Request, ctx: RouteContext<"/api/account/assessments/[id]/facts">) {
  const access = await testAccess();
  if ("error" in access) return access.error;
  const owner = await factsOwner(access.admin, access.parent, (await ctx.params).id);
  if ("error" in owner) return owner.error;
  const loaded = await loadFacts(access.admin, owner.id);
  if (loaded && "error" in loaded) return loaded.error;
  const step = loaded ? factsStep(loaded.session, Date.now() - loaded.startedAt) : { status: "ready" as const, seconds: FACTS_SECONDS };
  return Response.json({ ok: true, step } satisfies FactsStepResult, noStore);
}

export async function POST(_request: Request, ctx: RouteContext<"/api/account/assessments/[id]/facts">) {
  const access = await testAccess();
  if ("error" in access) return access.error;
  const { admin, parent } = access;
  const owner = await factsOwner(admin, parent, (await ctx.params).id);
  if ("error" in owner) return owner.error;
  if (owner.status !== "in_progress") return testFail("conflict", 409);

  // A second click, or a reload after Start: the section already runs, so carry on with it.
  const existing = await loadFacts(admin, owner.id);
  if (existing && "error" in existing) return existing.error;
  if (existing) return Response.json({ ok: true, step: factsStep(existing.session, Date.now() - existing.startedAt) } satisfies FactsStepResult);

  const session = createFacts(owner.test.profile, owner.test.seed);
  const startedAt = Date.now();
  const { error } = await admin.from("assessment_facts")
    .insert({ assessment_id: owner.id, started_at: new Date(startedAt).toISOString(), test: storedFacts(session) });
  if (error) {
    if (error.code === "23505") {
      const raced = await loadFacts(admin, owner.id);
      if (raced && !("error" in raced)) return Response.json({ ok: true, step: factsStep(raced.session, Date.now() - raced.startedAt) } satisfies FactsStepResult);
    }
    console.error("[facts] start failed", error.message);
    return testFail("store_failed", 502);
  }
  return Response.json({ ok: true, step: factsStep(session, 0) } satisfies FactsStepResult);
}
