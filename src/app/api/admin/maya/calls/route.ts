import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { boardPlayback } from "@/lib/maya-call";
import { serverMayaCalls, testQuestion } from "@/lib/maya-call-server";

// Starts an admin test call with Maya (#323) on a supported question of a test family's child. Body: { assessmentId,
// questionId }. Answers { ok, view, output, board } or { ok: false, error }. Admins only; a family that is not marked as
// a test family is refused (not_test_family), here and in the database.
export const maxDuration = 300;

export async function POST(request: Request) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const body = (await request.json().catch(() => null)) as { assessmentId?: unknown; questionId?: unknown } | null;
  const assessmentId = typeof body?.assessmentId === "string" && isUuid(body.assessmentId) ? body.assessmentId.toLowerCase() : null;
  const questionId = typeof body?.questionId === "string" && body.questionId.length <= 40 ? body.questionId : null;
  if (!assessmentId || !questionId) return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const calls = serverMayaCalls();
  if (!calls) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  try {
    const question = await testQuestion(assessmentId, questionId);
    if (!question) return Response.json({ ok: false, error: "invalid_question" }, { status: 404 });
    const result = await calls.start({ kind: "admin_test", ...question, startedBy: admin.userId });
    if (!result.ok) return Response.json(result, { status: result.error === "not_test_family" ? 403 : 409 });
    return Response.json({ ...result, board: boardPlayback(result.view.batches) });
  } catch (e) {
    console.error("[maya call] start failed", e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
