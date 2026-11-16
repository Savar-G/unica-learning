import "server-only";
import { cache } from "react";
import { readSchedule, type ScheduleView } from "@/lib/parent-schedule";
import { parentScheduleStore } from "@/lib/parent-schedule-store";
import { adminClient, sessionClient } from "@/lib/supabase-auth";

/** Request-only cache for the selected child's complete frozen schedule. */
export const parentSchedule = cache(async (parent: string, child: string, book: string | null = null): Promise<ScheduleView> => {
  const service = adminClient();
  if (!service) return { kind: "unavailable", child: null };
  try { return await readSchedule(parentScheduleStore(await sessionClient(), service, parent), parent, { child, book }); }
  catch { return { kind: "unavailable", child: null }; }
});
