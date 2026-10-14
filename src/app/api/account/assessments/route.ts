import { isUuid, newSeed } from "@/lib/assessment-store";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { refusalResponse, testFail, type StartResult } from "@/lib/test-api";
import { startTest } from "@/lib/test-attempt";
import { attemptStore } from "@/lib/test-attempt-server";

// Starts a test for one of the parent's children, or continues the test open for that child (#64, #72).
// The questions are drawn now, from a new seed, and stored with the assessment; the browser never sees them in full.
// `restart`: the family pressed "Start again" after the test expired. Without it, an expired test is refused, not
// replaced, so a family who pressed "Continue" learns that the time ran out. A new test opens 30 days after the last
// completed one. The test attempt module (src/lib/test-attempt.ts, #146) runs the rules; this route only translates.
export async function POST(request: Request) {
  const parent = await parentId(await sessionClient());
  if (!parent) return testFail("signed_out", 401);
  const admin = adminClient();
  if (!admin) return testFail("store_failed", 503);

  let body: { childId?: unknown; restart?: unknown };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return testFail("bad_json", 400);
  }
  const { childId } = body;
  if (!isUuid(childId)) return testFail("invalid", 400);

  const outcome = await startTest(attemptStore(admin), parent, childId, Date.now(), { restart: body.restart === true, newSeed });
  if (!outcome.ok) return refusalResponse(outcome);
  return Response.json({ ok: true, id: outcome.id, resumed: outcome.resumed } satisfies StartResult);
}
