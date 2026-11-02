import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { familyTime, familyWhen, familyZone, type RetryTime } from "@/lib/family-time";

/** Read with the parent's session. Return text, so the device cannot change the family zone or its rules. */
export async function familyRetryTime(db: SupabaseClient<Database>, at: number): Promise<RetryTime> {
  const [{ data }, { data: child }] = await Promise.all([
    db.from("parents").select("postal, time_zone").maybeSingle(),
    db.from("children").select("province").order("created_at").limit(1).maybeSingle(),
  ]);
  const timeZone = familyZone({ timeZone: data?.time_zone, postal: data?.postal, province: child?.province });
  return { retryWhen: familyWhen(at, timeZone), retryTime: familyTime(at, timeZone) };
}
