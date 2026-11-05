import { saveChatBoard } from "@/lib/maya-chat-server";
import { deskChatContext } from "@/lib/desk-chat-request";
import { isUuid } from "@/lib/workbook-content";
import { MAX_INK_TEXT } from "@/lib/maya-call";

// The chat's board from the child's desk (#534): `{ id, board }`, the chat's id and the desk's copy of its board (an
// encoded board history), kept with the call for the admin replay. The same check as the chat itself.
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const MAX_BODY = MAX_INK_TEXT + 200;
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "forbidden" }, 403);
  if (Number(request.headers.get("content-length")) > MAX_BODY) return json({ error: "invalid" }, 400);
  const body = await request.text();
  if (body.length > MAX_BODY) return json({ error: "invalid" }, 400);
  let save: { id?: unknown; board?: unknown };
  try { save = JSON.parse(body); } catch { return json({ error: "invalid" }, 400); }
  if (!save || !isUuid(save.id) || typeof save.board !== "string") return json({ error: "invalid" }, 400);
  try {
    const gate = await deskChatContext(request);
    if (!gate.ok) return json({ error: gate.error }, gate.status);
    const saved = await saveChatBoard(gate.ctx, save.id, save.board);
    return saved.ok ? json({ ok: true }) : json({ error: saved.error === "invalid_input" ? "invalid" : "not_found" }, saved.error === "invalid_input" ? 400 : 404);
  } catch (error) {
    console.error("[desk chat board] request failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "unavailable" }, 503);
  }
}
