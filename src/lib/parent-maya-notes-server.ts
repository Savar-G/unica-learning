import "server-only";
import { notFound, redirect } from "next/navigation";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { familyProvince, familyZone, type FamilyZone } from "@/lib/family-time";
import { parentChatUsage } from "@/lib/maya-chat-server";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";

/**
 * Each page checks ownership before it reads any note. All reads use the parent's own session. `mayaTab` is set when the
 * dashboard is open to this family and this child has the Maya tab (#553): the pages then are that tab. Otherwise they
 * stay as they were.
 */
export async function parentNotesFamily(childId: string) {
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) redirect("/sign-in");
  const [{ data: family, error }, { data: children, error: childError }] = await Promise.all([
    db.from("parents").select("postal, time_zone").eq("id", parent).maybeSingle(),
    db.from("children").select("id, first_name, grade, province, created_at").eq("parent_id", parent).order("created_at").order("id"),
  ]);
  if (error || childError) throw new Error("Parent notes family could not be read");
  if (!family) redirect("/account/finish");
  const child = children?.find((c) => c.id === childId);
  if (!child) notFound();
  const zone = familyZone({ timeZone: family.time_zone, postal: family.postal, province: familyProvince(children ?? []) });
  const view = (await parentDashboard())?.children.find((c) => c.id === child.id);
  return { db, parent, child, zone, mayaTab: !!view?.tabs.includes("maya") };
}

/**
 * The Maya tab's usage (#553, D-293): existing chat usage only, as Parent home reads it. A closed family or an ineligible
 * grade has no usage. The shared voice ledger and its callers outside this parent presentation stay intact.
 */
export async function mayaWeek(db: SupabaseClient<Database>, parent: string, zone: FamilyZone, child: { id: string; grade: number }) {
  const chats = await parentChatUsage(db, parent, [child], zone);
  return { chat: chats.get(child.id) };
}
