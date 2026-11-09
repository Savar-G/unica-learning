import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { familyTime, familyWhen, familyZone, familyProvince, type FamilyZone, type RetryTime } from "@/lib/family-time";

/** Read with the parent's session. Return text, so the device cannot change the family zone or its rules. */
export async function familyRetryTime(db: SupabaseClient<Database>, at: number): Promise<RetryTime> {
  const [{ data }, province] = await Promise.all([
    db.from("parents").select("postal, time_zone").maybeSingle(),
    loadFamilyProvince(db),
  ]);
  const timeZone = familyZone({ timeZone: data?.time_zone, postal: data?.postal, province });
  return { retryWhen: familyWhen(at, timeZone), retryTime: familyTime(at, timeZone) };
}

/** One family's zone by the shared rule, read with the server key for a checked parent (scan results, #715). */
export async function loadFamilyZone(db: SupabaseClient<Database>, parentId: string): Promise<FamilyZone> {
  const [{ data, error }, province] = await Promise.all([
    db.from("parents").select("postal, time_zone").eq("id", parentId).maybeSingle(),
    loadFamilyProvince(db, parentId),
  ]);
  if (error) throw new Error(`family zone load: ${error.message}`);
  return familyZone({ timeZone: data?.time_zone, postal: data?.postal, province });
}

/** Read zones for a set of checked parents with batched queries. */
export async function loadFamilyZones(db: SupabaseClient<Database>, parentIds: readonly string[]): Promise<Map<string, FamilyZone>> {
  const ids = [...new Set(parentIds)];
  const parents: { id: string; postal: string | null; time_zone: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from("parents").select("id, postal, time_zone").in("id", ids.slice(i, i + 100));
    if (error) throw new Error(`family zone load: ${error.message}`);
    parents.push(...(data ?? []));
  }
  const children = await loadFamilyChildren(db, ids);
  return new Map(ids.map((id) => {
    const parent = parents.find((p) => p.id === id);
    return [id, familyZone({ timeZone: parent?.time_zone, postal: parent?.postal, province: familyProvince(children.filter((c) => c.parent_id === id)) })];
  }));
}

/** Session reads use RLS. Admin report reads use the existing admin RPC. Both use the same ordering. */
export async function loadFamilyProvince(db: SupabaseClient<Database>, parentId?: string, admin = false): Promise<string | null> {
  let query = (admin ? db.rpc("admin_children") : db.from("children")).select("id, created_at, province");
  if (parentId) query = query.eq("parent_id", parentId);
  const { data, error } = await query.order("created_at").order("id").limit(1).maybeSingle();
  if (error) throw new Error(`family province load: ${error.message}`);
  return familyProvince(data ? [data] : []);
}

/** Include siblings with no activity. Page by ID so concurrent deletion cannot skip a child. */
export async function loadFamilyChildren(db: SupabaseClient<Database>, parentIds: readonly string[], signal?: AbortSignal) {
  const children = [];
  for (let i = 0; i < parentIds.length; i += 100) {
    let after: string | null = null;
    for (;;) {
      let query = db.from("children").select("id, parent_id, first_name, province, created_at").in("parent_id", parentIds.slice(i, i + 100)).order("id").limit(1000);
      if (after) query = query.gt("id", after);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (error) throw new Error(`family children load: ${error.message}`);
      children.push(...(data ?? []));
      if (!data || data.length < 1000) break;
      after = data[data.length - 1].id;
    }
  }
  return children;
}
