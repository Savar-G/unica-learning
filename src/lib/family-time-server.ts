import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { familyTime, familyWhen, zoneFor, type RetryTime } from "@/lib/family-time";

/** Read with the parent's session. Return text, so the device cannot change the family zone or its rules. */
export async function familyRetryTime(db: SupabaseClient<Database>, at: number): Promise<RetryTime> {
  const { data } = await db.from("parents").select("postal").maybeSingle();
  const timeZone = zoneFor(data?.postal ?? null);
  return { retryWhen: familyWhen(at, timeZone), retryTime: familyTime(at, timeZone) };
}
