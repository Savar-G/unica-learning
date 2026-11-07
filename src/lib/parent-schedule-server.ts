import "server-only";
import { cache } from "react";
import { readSchedule, type ScheduleView } from "@/lib/parent-schedule";
import { parentScheduleStore } from "@/lib/parent-schedule-store";
import { adminClient, sessionClient } from "@/lib/supabase-auth";

/** The shell needs only book existence. Keep draft, question and receipt reads on the Schedule page. */
export const hasPrintedSchedule = cache(async (parent: string, child: string): Promise<boolean> => {
  const service = adminClient();
  if (!service) return false;
  try {
    const { data, error } = await service.from("workbooks").select("id")
      .eq("parent_id", parent).eq("child_id", child).in("status", ["printed", "shipped"]).limit(1);
    return !error && !!data?.length;
  } catch { return false; }
});

/** Request-only cache for the selected child's complete frozen schedule. */
export const parentSchedule = cache(async (parent: string, child: string, book: string | null = null): Promise<ScheduleView> => {
  const service = adminClient();
  if (!service) return { kind: "unavailable", child: null };
  try { return await readSchedule(parentScheduleStore(await sessionClient(), service, parent), parent, { child, book }); }
  catch { return { kind: "unavailable", child: null }; }
});
