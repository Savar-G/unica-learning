import { adminSession } from "@/lib/admin-store";
import { serverMayaCalls } from "@/lib/maya-call-server";
import { selectWorkbookQuestion, type WorkbookSelectionInput } from "@/lib/maya-workbook-question";
import { serverMayaNotice } from "@/lib/maya-notice-server";
import { livekitProject } from "@/lib/maya-voice";
import { mintVoiceToken } from "@/lib/maya-voice-token";
import { adminWorkbookReader } from "@/lib/maya-workbook-server";

export const maxDuration = 60;
const headers = { "cache-control": "no-store" };

/** Every action resolves the stored reference again. Client packages and family ids are never used. */
export async function POST(request: Request) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const body = await request.json().catch(() => null) as (WorkbookSelectionInput & { mode?: unknown }) | null;
  if (!body || (body.mode !== "select" && body.mode !== "text" && body.mode !== "voice")) return Response.json({ ok: false, error: "invalid_input" }, { status: 400, headers });
  try {
    const selected = await selectWorkbookQuestion(body, adminWorkbookReader(admin));
    if (!selected.ok) return Response.json(selected, { status: selected.error === "reference_again" ? 400 : 404, headers });
    if (body.mode === "select") return Response.json({ ok: true, ref: selected.ref, text: selected.package.text }, { headers });
    const project = body.mode === "voice" ? livekitProject(process.env) : null;
    if (body.mode === "voice" && !project) return Response.json({ ok: false, error: "voice_unavailable" }, { status: 503, headers });
    // This admin slice uses the fake model for both transports, even when the server has a paid model key.
    const calls = serverMayaCalls(new URL(request.url).origin, true);
    if (!calls) return Response.json({ ok: false, error: "unavailable" }, { status: 503, headers });
    const input = { kind: "admin_test" as const, ...selected, confirmWorkbook: true, startedBy: admin.userId };
    const result = body.mode === "voice" ? await calls.startVoice(input) : await calls.start(input);
    if (!result.ok) return Response.json(result, { status: 409, headers });
    if (project) {
      const ticket = await mintVoiceToken({ call: result.view, notice: serverMayaNotice(), parentId: selected.parentId, childId: selected.childId, project, name: null });
      if (!ticket.ok) return Response.json({ ok: false, error: "failed" }, { status: 500, headers });
      return Response.json({ ok: true, callId: result.view.id, ticket: ticket.ticket }, { headers });
    }
    return Response.json({ ok: true, callId: result.view.id }, { headers });
  } catch (e) {
    console.error("[maya workbook]", e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "failed" }, { status: 500, headers });
  }
}
