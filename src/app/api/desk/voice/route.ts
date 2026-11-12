import { deskChatContext } from "@/lib/desk-chat-request";
import { runVoice, voiceGate } from "@/lib/maya-voice-desk-server";
import type { DeskVoiceReply, VoiceAction } from "@/lib/maya-voice-desk";
import { isUuid } from "@/lib/workbook-content";

// A child's voice call with Maya from the desk. One POST route for the call screen: { type: "start", id, question } makes the
// call and answers its LiveKit ticket; { type: "token", id } a fresh ticket for the child's own live call (reconnect);
// { type: "read", id } the call's child-safe view; { type: "cancel", id } ends a call Maya has not joined. Every answer is a
// DeskVoiceReply with Cache-Control: no-store. The parent and the child come from the signed-in parent and the desk cookie,
// never from the body.
export const maxDuration = 60;

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const refused = (error: string, status: number) => json({ call: null, usage: null, error } satisfies DeskVoiceReply, status);

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return refused("forbidden", 403);
  if (Number(request.headers.get("content-length")) > 2000) return refused("invalid", 400);
  const body = await request.text();
  if (body.length > 2000) return refused("invalid", 400);
  let action: VoiceAction;
  try { action = JSON.parse(body); } catch { return refused("invalid", 400); }
  if (!action || typeof action !== "object" || !isUuid(action.id) || !["start", "token", "read", "cancel"].includes(action.type)) return refused("invalid", 400);
  if (action.type === "start") {
    const q = action.question;
    if (!q || typeof q !== "object" || q.source !== "workbook" || !isUuid(q.workbookId) ||
      !Number.isSafeInteger(q.page) || q.page < 1 || !Number.isSafeInteger(q.question) || q.question < 1) return refused("invalid", 400);
    // Only the fields of the question reference reach the call module.
    action = { type: "start", id: action.id, question: { source: "workbook", workbookId: q.workbookId, page: q.page, question: q.question } };
  } else action = { type: action.type, id: action.id };
  try {
    const gate = await deskChatContext(request);
    if (!gate.ok) return refused(gate.error, gate.status);
    // A new call and a new ticket need voice open to this child. Reading and cancelling a call need only the desk.
    if ((action.type === "start" || action.type === "token") && await voiceGate(gate.ctx.db, gate.ctx.parent, gate.ctx.grade, gate.ctx.child) !== "open") return refused("unavailable", 403);
    return json(await runVoice(gate.ctx, action));
  } catch (error) {
    console.error("[desk voice] request failed", error instanceof Error ? error.message : "unknown");
    return refused("unavailable", 503);
  }
}
