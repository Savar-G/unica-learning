import { cookies } from "next/headers";
import { DESK_COOKIE, readLock } from "@/lib/desk";
import { parentId, sessionClient, adminClient } from "@/lib/supabase-auth";
import { familyZone } from "@/lib/family-time";
import { loadFamilyProvince } from "@/lib/family-time-server";
import { chatAccess, runChat, type ChatAction } from "@/lib/maya-chat-server";
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
    const session = await sessionClient(), parent = await parentId(session);
    if (!parent) return json({ error: "signed_out" }, 401);
    const lock = readLock((await cookies()).get(DESK_COOKIE)?.value);
    if (!lock || lock.parentId !== parent) return json({ error: "forbidden" }, 403);
    const [{ data: child }, { data: family }, province] = await Promise.all([
      session.from("children").select("first_name, grade").eq("id", lock.childId).eq("parent_id", parent).maybeSingle(),
      session.from("parents").select("time_zone, postal").eq("id", parent).maybeSingle(), loadFamilyProvince(session, parent),
    ]);
    const db = adminClient();
    if (!child || !family || !db || !await chatAccess(db, parent)) return json({ error: "unavailable" }, 403);
    return json(await runChat({ db, parent, child: lock.childId, name: child.first_name, grade: child.grade, zone: familyZone({ timeZone: family.time_zone, postal: family.postal, province }) }, action));
  } catch (error) {
    console.error("[desk chat] request failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "unavailable" }, 503);
  }
}
