import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { serverMayaCalls, testQuestion } from "@/lib/maya-call-server";
import { livekitProject } from "@/lib/maya-voice";
import { mintVoiceToken } from "@/lib/maya-voice-token";

// Starts an admin voice call with Maya (#326) on a supported question of a test family's child. Body: { assessmentId,
// questionId }. Makes the call's record (not started: Maya's voice worker starts it when the child joins) and returns
// the token to join its room, for that family's child only. Answers { ok, callId, ticket } or { ok: false, error }.
// Admins only; a family that is not marked as a test family is refused (not_test_family), here and in the database.
export const maxDuration = 60;

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const project = livekitProject(process.env);
  if (!project) return Response.json({ ok: false, error: "voice_unavailable" }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { assessmentId?: unknown; questionId?: unknown } | null;
  const assessmentId = typeof body?.assessmentId === "string" && isUuid(body.assessmentId) ? body.assessmentId.toLowerCase() : null;
  const questionId = typeof body?.questionId === "string" && body.questionId.length <= 40 ? body.questionId : null;
  if (!assessmentId || !questionId) return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const calls = serverMayaCalls();
  if (!calls) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  try {
    const question = await testQuestion(assessmentId, questionId);
    if (!question) return Response.json({ ok: false, error: "invalid_question" }, { status: 404 });
    const result = await calls.startVoice({ kind: "admin_test", ...question, startedBy: admin.userId });
    if (!result.ok) return Response.json(result, { status: result.error === "not_test_family" ? 403 : 409 });
    const v = result.view;
    const minted = await mintVoiceToken({ call: { id: v.id, parentId: v.parentId, childId: v.childId, mode: v.mode, status: v.status }, parentId: question.parentId, childId: question.childId, project, name: question.childName });
    if (!minted.ok) return Response.json({ ok: false, error: "failed" }, { status: 500 });
    return Response.json({ ok: true, callId: v.id, ticket: minted.ticket }, { headers: noStore });
  } catch (e) {
    console.error("[maya voice] start failed", e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
