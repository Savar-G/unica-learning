import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { adminClient } from "@/lib/supabase-auth";
import { createMinutesLedger, familyTimeZone, usageMinutes } from "@/lib/maya-minutes";
import { mayaMinutesStore } from "@/lib/maya-minutes-store";

/** One child's Maya minutes this week, as Parent home shows them. */
export interface ChildMinutes {
  used: number;
  left: number;
  /** The day the minutes come back, in the family's time zone ("Monday, November 9"). */
  backOn: string;
}

/**
 * Each child's Maya minutes used and left this week, for Parent home (#330). Read with the parent's own session
 * (maya_minutes_used refuses another family). Shown only to test families (D-099) until Maya opens to families (#337):
 * an empty map for every other family, or when the minutes cannot be read.
 */
export async function parentMinutes(db: SupabaseClient<Database>, parentId: string, timeZone: string | null, children: readonly { id: string; province: string }[]): Promise<Map<string, ChildMinutes>> {
  try {
    const admin = adminClient();
    if (!admin || children.length === 0) return new Map();
    const { data: test, error } = await admin.from("test_accounts").select("parent_id").eq("parent_id", parentId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!test) return new Map();
    const ledger = createMinutesLedger({ store: mayaMinutesStore(db), clock: Date.now });
    const tz = familyTimeZone(timeZone, children[0]?.province);
    const rows = await Promise.all(children.map(async (c) => {
      const usage = await ledger.usage({ parentId, childId: c.id, timeZone: tz });
      const backOn = new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(new Date(usage.resetsAt));
      return [c.id, { ...usageMinutes(usage), backOn }] as const;
    }));
    return new Map(rows);
  } catch (e) {
    console.error("[account] Maya minutes read failed", e instanceof Error ? e.message : e);
    return new Map();
  }
}
