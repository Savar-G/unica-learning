import { runChat, type ChatAction } from "@/lib/maya-chat-server";
import { deskChatContext } from "@/lib/desk-chat-request";
import { isUuid } from "@/lib/workbook-content";
import { MAX_CHILD_TEXT } from "@/lib/maya-call";
import { readFateReports } from "@/lib/maya-text";
import { after } from "next/server";
import { CHAT_STREAM_TYPE, chatStream } from "@/lib/maya-chat-stream";

export const maxDuration = 120;
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "forbidden" }, 403);
  if (Number(request.headers.get("content-length")) > 4000) return json({ error: "invalid" }, 400);
  const body = await request.text();
  if (body.length > 4000) return json({ error: "invalid" }, 400);
  let action: ChatAction;
  try { action = JSON.parse(body); } catch { return json({ error: "invalid" }, 400); }
  if (!action || !isUuid(action.id) || !["start", "read", "child", "end"].includes(action.type)) return json({ error: "invalid" }, 400);
  if (action.type === "start") {
    const typed = action.reference !== undefined || action.workbookId !== undefined;
    if (typed ? action.question !== undefined || !isUuid(action.workbookId) || typeof action.reference !== "string" || action.reference.length > 100
      : !action.question || action.question.source !== "workbook" || !isUuid(action.question.workbookId) ||
        !Number.isSafeInteger(action.question.page) || action.question.page < 1 || !Number.isSafeInteger(action.question.question) || action.question.question < 1) return json({ error: "invalid" }, 400);
  }
  if ((action.type === "child" || action.type === "end") && (!Number.isSafeInteger(action.revision) || action.revision < 0)) return json({ error: "invalid" }, 400);
  if (action.type === "child" && (!isUuid(action.messageId) || typeof action.text !== "string" || !action.text.trim() || action.text.length > MAX_CHILD_TEXT)) return json({ error: "invalid" }, 400);
  // B1: the board's word on Maya's batches, read strictly (at most 32, each a known fate).
  if (action.type === "child" && action.fates !== undefined && readFateReports(action.fates) === null) return json({ error: "invalid" }, 400);
  try {
    const gate = await deskChatContext(request);
    if (!gate.ok) return json({ error: gate.error }, gate.status);
    // #1107: a desk that asks for a stream gets one for an admitted child turn once its first checked sentence exists.
    // Every answer before that (each refusal, busy, done, the cap, a failure) is the JSON reply, as for older desks.
    const ctx = gate.ctx;
    if (action.type === "child" && (request.headers.get("accept") ?? "").includes(CHAT_STREAM_TYPE)) {
      const ran = await chatStream((say) => runChat(ctx, action, { say }), (work) => {
        // A reader that goes away never stops the turn: the function stays until the turn is saved.
        try { after(work); } catch { /* Outside a request (tests): the turn runs on in this process. */ }
      });
      if ("failed" in ran) throw ran.failed;
      if ("reply" in ran) return json(ran.reply);
      return new Response(ran.stream, { status: 200, headers: { "Content-Type": `${CHAT_STREAM_TYPE}; charset=utf-8`, "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
    }
    return json(await runChat(ctx, action));
  } catch (error) {
    console.error("[desk chat] request failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "unavailable" }, 503);
  }
}
