import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { DemoChild, DemoChildStore } from "@/lib/maya-demo-child";

// The demo child store (src/lib/maya-demo-child.ts, #323) in Supabase, with the secret key: public.children,
// public.assessments, public.test_accounts and the script's marker rows in public.maya_demo_children. Used by
// `npm run maya:demo-child` (scripts/maya-demo-child.ts). Tests use src/lib/maya-demo-child-memory.ts.

/** The data of a read that must succeed and find something. */
function must<T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  if (r.data === null || r.data === undefined) throw new Error(`${what}: nothing found`);
  return r.data;
}
/** The data of a read that must succeed and may find nothing. */
function maybe<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}
const child = (r: { id: string; first_name: string; grade: number; province: string }): DemoChild => ({ id: r.id, firstName: r.first_name, grade: r.grade, province: r.province });
const COLUMNS = "id, first_name, grade, province";

export function demoChildStore(db: SupabaseClient<Database>): DemoChildStore {
  return {
    async isTestFamily(parentId) {
      return maybe(await db.from("test_accounts").select("parent_id").eq("parent_id", parentId).maybeSingle(), "test family") !== null;
    },
    async markedChild(parentId) {
      const mark = maybe(await db.from("maya_demo_children").select("child_id").eq("parent_id", parentId).maybeSingle(), "marker");
      if (!mark) return null;
      const row = must(await db.from("children").select(COLUMNS).eq("id", mark.child_id).eq("parent_id", parentId).single(), "marked child");
      return child(row);
    },
    async childrenNamed(parentId, name) {
      return must(await db.from("children").select(COLUMNS).eq("parent_id", parentId).eq("first_name", name), "children").map(child);
    },
    async createMarkedChild(parentId, name) {
      const row = must(await db.from("children").insert({ parent_id: parentId, first_name: name, grade: 2, province: "BC" }).select(COLUMNS).single(), "new child");
      must(await db.from("maya_demo_children").insert({ child_id: row.id, parent_id: parentId }).select("child_id").single(), "marker");
      return child(row);
    },
    async rename(parentId, childId, name) {
      must(await db.from("children").update({ first_name: name }).eq("id", childId).eq("parent_id", parentId).select("id").single(), "rename");
    },
    async tests(childId) {
      return must(await db.from("assessments").select("id").eq("child_id", childId).order("started_at"), "tests").map((t) => t.id);
    },
    async createTest(parentId, childId, t) {
      const row = must(await db.from("assessments").insert({
        parent_id: parentId, child_id: childId, seed: t.seed, grade: 2, province: "BC", test: t.test, status: "expired",
        started_at: t.startedAt, resume_until: t.resumeUntil,
      }).select("id").single(), "test");
      return row.id;
    },
  };
}
