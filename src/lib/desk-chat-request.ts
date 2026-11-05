import "server-only";
import { cookies } from "next/headers";
import { DESK_COOKIE, readLock } from "@/lib/desk";
import { parentId, sessionClient, adminClient } from "@/lib/supabase-auth";
import { familyZone } from "@/lib/family-time";
import { loadFamilyProvince } from "@/lib/family-time-server";
import { chatGate, type ChatContext } from "@/lib/maya-chat-server";

/**
 * The one check before every desk chat request (`/api/desk/chat`, and the chat's board, `/api/desk/chat/board`, #534):
 * a request from this site, a signed-in parent, the desk open for one of their children, and chat open for the family
 * and the child's grade. The chat's context, or the answer to give.
 */
export async function deskChatContext(request: Request, options: { sameSite?: boolean } = {}): Promise<{ ok: true; ctx: ChatContext } | { ok: false; error: "forbidden" | "signed_out" | "unavailable"; status: number }> {
  // A read (GET) checks that the browser says it came from this site, as a GET carries no Origin header.
  const fromSite = options.sameSite ? request.headers.get("sec-fetch-site") === "same-origin" : request.headers.get("origin") === new URL(request.url).origin;
  if (!fromSite) return { ok: false, error: "forbidden", status: 403 };
  const session = await sessionClient(), parent = await parentId(session);
  if (!parent) return { ok: false, error: "signed_out", status: 401 };
  const lock = readLock((await cookies()).get(DESK_COOKIE)?.value);
  if (!lock || lock.parentId !== parent) return { ok: false, error: "forbidden", status: 403 };
  const [{ data: child }, { data: family }, province] = await Promise.all([
    session.from("children").select("first_name, grade").eq("id", lock.childId).eq("parent_id", parent).maybeSingle(),
    session.from("parents").select("time_zone, postal").eq("id", parent).maybeSingle(), loadFamilyProvince(session, parent),
  ]);
  const db = adminClient();
  // Family (test, or listed with the switch and a plan), then Grade 3 and up (#530).
  if (!child || !family || !db || await chatGate(db, parent, child.grade) !== "open") return { ok: false, error: "unavailable", status: 403 };
  return { ok: true, ctx: { db, parent, child: lock.childId, name: child.first_name, grade: child.grade, zone: familyZone({ timeZone: family.time_zone, postal: family.postal, province }) } };
}
