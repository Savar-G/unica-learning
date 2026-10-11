import type { Child } from "@/lib/account";
import { isUuid, newSeed, startStore, testAccess } from "@/lib/assessment-store";
import { testFail, type StartResult } from "@/lib/test-api";
import { startTest } from "@/lib/test-start";

// Starts a test for one of the parent's children, or continues the test open for that child (#64, #72).
// The questions are drawn now, from a new seed, and stored with the assessment; the browser never sees them in full.
// `restart`: the family pressed "Start again" after the test expired. Without it, an expired test is refused, not
// replaced, so a family who pressed "Continue" learns that the time ran out. A new test opens 30 days after the last
// completed one. The rules are the assessment core's (decideStart); src/lib/test-start.ts runs them.
export async function POST(request: Request) {
  const access = await testAccess();
  if ("error" in access) return access.error;
  const { parent, admin } = access;

  let body: { childId?: unknown; restart?: unknown };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return testFail("bad_json", 400);
  }
  const { childId } = body;
  if (!isUuid(childId)) return testFail("invalid", 400);

  const { data: child, error } = await admin.from("children").select("id, first_name, grade, province")
    .eq("id", childId).eq("parent_id", parent).maybeSingle<Child>();
  if (error) {
    console.error("[test] child load failed", error.message);
    return testFail("store_failed", 502);
  }
  if (!child) return testFail("not_found", 404);

  const now = Date.now();
  let outcome;
  try {
    outcome = await startTest(startStore(admin, parent, child), now, { restart: body.restart === true, newSeed });
  } catch (e) {
    console.error("[test] start failed", e instanceof Error ? e.message : e);
    return testFail("store_failed", 502);
  }
  if (outcome.ok) return Response.json({ ok: true, id: outcome.id, resumed: outcome.resumed } satisfies StartResult);
  switch (outcome.error) {
    case "expired":
      return testFail("expired", 410);
    case "retake_closed":
      return testFail("retake_closed", 409, { opensAt: new Date(outcome.opensAt).toISOString() });
    case "not_ready":
      return testFail("not_ready", 409);
    case "busy":
      return testFail("store_failed", 503);
  }
}
