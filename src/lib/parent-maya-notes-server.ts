import "server-only";
import { notFound, redirect } from "next/navigation";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { familyProvince, familyZone } from "@/lib/family-time";

/** Each page checks ownership before it reads any note. All reads use the parent's own session. */
export async function parentNotesFamily(childId: string) {
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) redirect("/sign-in");
  const [{ data: family, error }, { data: children, error: childError }] = await Promise.all([
    db.from("parents").select("postal, time_zone").eq("id", parent).maybeSingle(),
    db.from("children").select("id, first_name, province, created_at").eq("parent_id", parent).order("created_at").order("id"),
  ]);
  if (error || childError) throw new Error("Parent notes family could not be read");
  if (!family) redirect("/account/finish");
  const child = children?.find((c) => c.id === childId);
  if (!child) notFound();
  const zone = familyZone({ timeZone: family.time_zone, postal: family.postal, province: familyProvince(children ?? []) });
  return { db, parent, child, zone };
}
