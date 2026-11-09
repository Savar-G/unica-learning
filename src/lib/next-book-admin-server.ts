// "Prepare from snapshot" on the service client (#476). The route checks the admin session first; this reads the child's
// family and delivered book 1, and wires the same planner as the automatic step (src/lib/next-book-planner.ts).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { familyProvince, familyZone } from "./family-time";
import type { AdminNextBookDeps, AdminNextBookFamily } from "./next-book-admin";
import { NEXT_BOOK_REAL_FAMILIES, nextBookPlanner, nextBookWiring } from "./next-book-planner";
import { isTestAccount } from "./next-book-step-store";
import { nextBookSnapshotServer } from "./next-book-snapshot-server";

const must = <T>(r: { data: T; error: unknown }, what: string): T => {
  if (r.error) throw new Error(`next_book_admin_${what}`);
  return r.data;
};

/** The child's family and its delivered book 1, or null for an unknown child. Throws on a failed read. */
export async function adminNextBookFamily(db: SupabaseClient<Database>, childId: string): Promise<AdminNextBookFamily | null> {
  const child = must(await db.from("children").select("id,parent_id").eq("id", childId).maybeSingle(), "child");
  if (!child) return null;
  const [parent, children, book] = await Promise.all([
    db.from("parents").select("id,time_zone,postal,deletion_requested_at").eq("id", child.parent_id).maybeSingle(),
    db.from("children").select("id,created_at,province").eq("parent_id", child.parent_id),
    db.from("workbooks").select("id").eq("child_id", child.id).eq("parent_id", child.parent_id).eq("number", 1).maybeSingle(),
  ]);
  const p = must(parent, "parent");
  if (!p) return null;
  const kids = must(children, "children") ?? [];
  const book1 = must(book, "book");
  const delivered = book1 ? must(await db.from("workbook_delivery_receipts").select("workbook_id").eq("workbook_id", book1.id).maybeSingle(), "delivery") : null;
  const testFamily = await isTestAccount(db, p.id);
  return { parentId: p.id, deleting: p.deletion_requested_at !== null, testFamily, deliveredBook1: delivered?.workbook_id ?? null,
    zone: familyZone({ timeZone: p.time_zone, postal: p.postal, province: familyProvince(kids) }) };
}

export function adminNextBookDeps(db: SupabaseClient<Database>): AdminNextBookDeps {
  return {
    planner: nextBookPlanner(),
    realFamilies: NEXT_BOOK_REAL_FAMILIES,
    prepare: planner => {
      const wiring = nextBookWiring(planner);
      const server = wiring ? nextBookSnapshotServer(wiring, db) : null;
      return server ? server.prepare : null;
    },
    family: childId => adminNextBookFamily(db, childId),
    now: () => Date.now(),
  };
}
