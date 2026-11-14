import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import { notIn } from "@/lib/admin-test-families";
import type { TestFamilies } from "@/lib/admin-test-families";
import { familyProvince } from "@/lib/family-time";
import { onboardingCheckIns, type OnboardingCheckInLoad } from "@/lib/admin-onboarding";

/** Independent of card-list pagination, using the admin's session and existing admin-only reads. */
async function allRows<T>(query: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> }): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await query.range(offset, offset + 99);
    if (error || !data) throw Error("family_unavailable");
    rows.push(...data);
    if (data.length < 100) return rows;
  }
}

export async function loadOnboardingCheckIns(admin: AdminSession, tests: Pick<TestFamilies, "hidden">, now: number): Promise<OnboardingCheckInLoad> {
  try {
    const starts = [];
    for (let offset = 0; ; offset += 100) {
      // A broad UTC window includes every family's local day two days ago, including seasonal changes.
      let query = admin.db.from("plan_starts").select("card_setup_id,parent_id,finished_at")
        .eq("state", "started").eq("purpose", "initial")
        .gte("finished_at", new Date(now - 4 * 86400_000).toISOString()).lte("finished_at", new Date(now).toISOString())
        .order("finished_at").order("card_setup_id").order("generation");
      const hidden = notIn(tests.hidden);
      if (hidden) query = query.not("parent_id", "in", hidden);
      const { data, error } = await query.range(offset, offset + 99);
      if (error || !data) throw Error("starts_unavailable");
      starts.push(...data.filter((s) => !tests.hidden.includes(s.parent_id)));
      if (data.length < 100) break;
    }
    const rows = [];
    // Chunk family reads so PostgREST URL limits do not truncate the queue.
    const ids = [...new Set(starts.map((s) => s.parent_id))];
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const [parents, children, cards] = await Promise.all([
        allRows(admin.db.rpc("admin_parents").select("id,name,email,postal,time_zone").in("id", chunk).order("id")),
        allRows(admin.db.rpc("admin_children").select("id,parent_id,first_name,province,created_at").in("parent_id", chunk).order("created_at").order("id")),
        allRows(admin.db.rpc("admin_card_setups").select("id,child_id,parent_id").in("parent_id", chunk).order("id")),
      ]);
      for (const start of starts.filter((s) => chunk.includes(s.parent_id))) {
        const parent = parents.find((p) => p.id === start.parent_id);
        const card = cards.find((c) => c.id === start.card_setup_id && c.parent_id === start.parent_id);
        const child = children.find((c) => c.id === card?.child_id && c.parent_id === start.parent_id);
        if (!parent || !child || !start.finished_at) continue;
        rows.push({ cardId: start.card_setup_id, parentId: parent.id, childId: child.id, parentName: parent.name, childName: child.first_name,
          email: parent.email, finishedAt: start.finished_at,
          location: { timeZone: parent.time_zone, postal: parent.postal, province: familyProvince(children.filter((c) => c.parent_id === parent.id)) } });
      }
    }
    return { rows: onboardingCheckIns(rows, now), unavailable: false };
  } catch { return { rows: [], unavailable: true }; }
}
