import { runChat, type ChatAction } from "@/lib/maya-chat-server";
import { deskChatContext } from "@/lib/desk-chat-request";
import { isUuid } from "@/lib/workbook-content";
import { MAX_CHILD_TEXT } from "@/lib/maya-call";

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
  if (action.type === "start" && (!action.question || action.question.source !== "workbook" || !isUuid(action.question.workbookId) ||
    !Number.isSafeInteger(action.question.page) || action.question.page < 1 || !Number.isSafeInteger(action.question.question) || action.question.question < 1)) return json({ error: "invalid" }, 400);
  if ((action.type === "child" || action.type === "end") && (!Number.isSafeInteger(action.revision) || action.revision < 0)) return json({ error: "invalid" }, 400);
  if (action.type === "child" && (!isUuid(action.messageId) || typeof action.text !== "string" || !action.text.trim() || action.text.length > MAX_CHILD_TEXT)) return json({ error: "invalid" }, 400);
  try {
    const gate = await deskChatContext(request);
    if (!gate.ok) return json({ error: gate.error }, gate.status);
    return json(await runChat(gate.ctx, action));
  } catch (error) {
    console.error("[desk chat] request failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "unavailable" }, 503);
  }
}
