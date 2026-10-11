import { createSession, storedTest, type Grade } from "@/lib/assessment";
import type { Child } from "@/lib/account";
import { isUuid, newSeed, testAccess } from "@/lib/assessment-store";
import { testFail, type StartResult } from "@/lib/test-api";

// Starts a test for one of the parent's children, or returns the test already open for that child.
// The questions are drawn now, from a new seed, and stored with the assessment; the browser never sees them in full.
export async function POST(request: Request) {
  const access = await testAccess();
  if ("error" in access) return access.error;
  const { parent, admin } = access;

  let childId: unknown;
  try {
    childId = ((await request.json()) as { childId?: unknown })?.childId;
  } catch {
    return testFail("bad_json", 400);
  }
  if (!isUuid(childId)) return testFail("invalid", 400);

  const { data: child, error } = await admin.from("children").select("id, first_name, grade, province")
    .eq("id", childId).eq("parent_id", parent).maybeSingle<Child>();
  if (error) {
    console.error("[test] child load failed", error.message);
    return testFail("store_failed", 502);
  }
  if (!child) return testFail("not_found", 404);

  const open = async () => {
    const { data } = await admin.from("assessments").select("id").eq("child_id", child.id).eq("status", "in_progress").maybeSingle<{ id: string }>();
    return data?.id ?? null;
  };
  const existing = await open();
  if (existing) return Response.json({ ok: true, id: existing, resumed: true } satisfies StartResult);

  const seed = newSeed();
  let session;
  try {
    session = createSession({ grade: child.grade as Grade, province: child.province }, seed);
  } catch (e) {
    console.error("[test] cannot build a test", child.grade, e instanceof Error ? e.message : e);
    return testFail("not_ready", 409);
  }

  const { data: row, error: insertError } = await admin.from("assessments")
    .insert({ parent_id: parent, child_id: child.id, seed, grade: child.grade, province: child.province, test: storedTest(session) })
    .select("id").single<{ id: string }>();
  if (insertError) {
    // A second click got here first: one open test per child (unique index), so use that one.
    const raced = insertError.code === "23505" ? await open() : null;
    if (raced) return Response.json({ ok: true, id: raced, resumed: true } satisfies StartResult);
    console.error("[test] start failed", insertError.message);
    return testFail("store_failed", 502);
  }
  return Response.json({ ok: true, id: row.id, resumed: false } satisfies StartResult);
}
