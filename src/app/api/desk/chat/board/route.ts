import { appendChatInk, readChatInk } from "@/lib/maya-chat-server";
import { deskChatContext } from "@/lib/desk-chat-request";
import { isUuid } from "@/lib/workbook-content";
import { MAX_INK_TEXT } from "@/lib/maya-call";

// The child's ink on a chat's board (#534, #635), with the same check as the chat itself. The ink is a log: one event per
// change the child makes and per batch of Maya's as it reached the board, numbered by the desk from 1.
// POST `{ id, from, events }`: the events at sequences `from`, `from + 1`, …; the call keeps each sequence once, and
// answers `{ held }`, the last sequence it holds. 429 "busy" (one append a second per chat) and 409 "gap" (`from` is past
// the next sequence) carry `held` too; 410 "closed": the chat ended more than a few minutes ago.
// GET `?id=`: the log the call holds (`events`), for a desk with no draft of the board.
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const MAX_BODY = MAX_INK_TEXT + 200;

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!isUuid(id)) return json({ error: "invalid" }, 400);
  try {
    // A GET carries no Origin header from the same site: the check is the session and the desk lock.
    const gate = await deskChatContext(request, { sameSite: true });
    if (!gate.ok) return json({ error: gate.error }, gate.status);
    const events = await readChatInk(gate.ctx, id);
    return events ? json({ events }) : json({ error: "not_found" }, 404);
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
  let save: { id?: unknown; from?: unknown; events?: unknown };
  try { save = JSON.parse(body); } catch { return json({ error: "invalid" }, 400); }
  if (!save || !isUuid(save.id)) return json({ error: "invalid" }, 400);
  try {
    const gate = await deskChatContext(request);
    if (!gate.ok) return json({ error: gate.error }, gate.status);
    const appended = await appendChatInk(gate.ctx, save.id, save.from, save.events);
    if (appended.ok) return json({ held: appended.held });
    const status = { invalid_input: 400, not_found: 404, busy: 429, gap: 409, closed: 410 }[appended.error];
    return json({ error: appended.error === "invalid_input" ? "invalid" : appended.error, held: appended.held }, status);
  } catch (error) {
    console.error("[desk chat board] request failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "unavailable" }, 503);
  }
}
