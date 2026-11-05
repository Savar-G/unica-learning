import { readChatBoard, saveChatBoard } from "@/lib/maya-chat-server";
import { deskChatContext } from "@/lib/desk-chat-request";
import { isUuid } from "@/lib/workbook-content";
import { encodeHistory } from "@/lib/board-history";
import { MAX_INK_TEXT } from "@/lib/maya-call";

// The chat's board from the child's desk (#534), with the same check as the chat itself.
// POST `{ id, board }`: the chat's id and the desk's copy of its board (an encoded board history), kept with the call
// for the admin replay. One board a second per chat (429 "busy"); none once the chat ended more than a few minutes ago
// (410 "closed"); an older copy than the kept one is a conflict (409 "stale", with the kept `board`, R625b-4).
// GET `?id=`: the kept board, for a desk that has no draft of it (`board`, or null).
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const MAX_BODY = MAX_INK_TEXT + 200;

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!isUuid(id)) return json({ error: "invalid" }, 400);
  try {
    // A GET carries no Origin header from the same site: the check is the session and the desk lock.
    const gate = await deskChatContext(request, { sameSite: true });
    if (!gate.ok) return json({ error: gate.error }, gate.status);
    const board = await readChatBoard(gate.ctx, id);
    return json({ board: board ? encodeHistory(board) : null });
  } catch (error) {
    console.error("[desk chat board] read failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "unavailable" }, 503);
  }
}

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
    if (saved.ok) return json({ ok: true });
    if (saved.error === "stale") return json({ error: "stale", board: encodeHistory(saved.board) }, 409);
    const answer = { invalid_input: ["invalid", 400], not_found: ["not_found", 404], busy: ["busy", 429], closed: ["closed", 410] } as const;
    const [error, status] = answer[saved.error];
    return json({ error }, status);
  } catch (error) {
    console.error("[desk chat board] request failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "unavailable" }, 503);
  }
}
