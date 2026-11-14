import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { childFirstName, voiceCallFacts } from "@/lib/maya-call-server";
import { serverMayaNotice } from "@/lib/maya-notice-server";
import { livekitProject } from "@/lib/maya-voice";
import { mintVoiceToken } from "@/lib/maya-voice-token";

// A fresh token to join a live admin voice call (#326): for its own test family's child and its own room only. The
// admin's screen asks for one when it connects or reconnects. Answers { ok, ticket } or { ok: false, error }.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/maya/calls/[id]/token">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const project = livekitProject(process.env);
  if (!project) return Response.json({ ok: false, error: "voice_unavailable" }, { status: 503 });
  try {
    const call = await voiceCallFacts(id);
    if (!call) return new Response("Not found", { status: 404 });
    // Only a test call: an admin never joins a family's call as the child (a family call has its own desk route).
    if (call.kind !== "admin_test") return new Response("Not found", { status: 404 });
    // An admin test call acts as the call's own child: the family comes from the call, never from the request.
    const minted = await mintVoiceToken({ call, notice: serverMayaNotice(), parentId: call.parentId, childId: call.childId, project, name: await childFirstName(call.childId) });
    if (!minted.ok) return Response.json({ ok: false, error: minted.error }, { status: 409 });
    return Response.json({ ok: true, ticket: minted.ticket }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[maya voice] token failed", id, e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
